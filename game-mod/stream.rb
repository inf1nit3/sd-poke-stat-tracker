#==============================================================================#
#                              PokeStatStream                                  #
#                   Live state streamer for sd-poke-stat-tracker               #
#                                                                              #
# Streams the player's party + a few global state values over a local TCP      #
# socket (127.0.0.1:9988) every ~0.5 s. The companion Decky plugin reads the  #
# JSON and updates its in-memory cache so the UI shows live data without        #
# waiting for the game to save to disk.                                        #
#                                                                              #
# The script is intentionally defensive: any error inside the stream is         #
# swallowed so a misbehaving listener can't crash the game.                    #
#==============================================================================#
#
# NOTE: This file deliberately does NOT `require 'json'`. Some Pokémon
# Essentials builds ship with an older Ruby that lacks the json gem, which
# produces a LoadError on startup. We use a custom to_json below instead.
# Do not "fix" this by adding require 'json' — see git history for context.

require "socket"

class PokeStatStream
  HOST = "127.0.0.1"
  PORT = 9988
  INTERVAL_FRAMES = 30   # ~0.5s at 60 fps
  CONNECT_RETRY_FRAMES = 600  # ~10s between reconnect attempts
  MAX_PAYLOAD_BYTES = 64 * 1024

  class << self
    def socket
      return @socket if @socket && !@socket.closed?
      @socket = nil
      return nil if @last_attempt_frame && (@frame_counter - @last_attempt_frame) < CONNECT_RETRY_FRAMES
      begin
        sock = TCPSocket.new(HOST, PORT)
        sock.setsockopt(Socket::IPPROTO_TCP, Socket::TCP_NODELAY, 1)
        @socket = sock
        @last_attempt_frame = nil
        sock
      rescue Errno::ECONNREFUSED, Errno::EADDRNOTAVAIL, Errno::ETIMEDOUT, Errno::EHOSTUNREACH, SocketError, IOError
        @last_attempt_frame = @frame_counter
        nil
      end
    end

    def close_socket!
      return unless @socket
      begin
        @socket.close
      rescue IOError
      end
      @socket = nil
    end

    def tick_frame!
      @frame_counter = (@frame_counter || 0) + 1
      if @frame_counter % INTERVAL_FRAMES != 0
        return
      end
      stream_state
    rescue StandardError => e
      # Never let the game crash from a streaming error.
      close_socket!
      log_error(e)
    end

    def log_error(e)
      $stderr.puts("[PokeStatStream] #{e.class}: #{e.message}") rescue nil
    end

    def to_json(obj)
      if obj.is_a?(Hash)
        "{" + obj.map { |k, v| to_json(k.to_s) + ":" + to_json(v) }.join(",") + "}"
      elsif obj.is_a?(Array)
        "[" + obj.map { |v| to_json(v) }.join(",") + "]"
      elsif obj.is_a?(String)
        '"' + obj.gsub('\\', '\\\\').gsub('"', '\\"').gsub("\n", '\\n') + '"'
      elsif obj.is_a?(Numeric)
        obj.to_s
      elsif obj == true
        "true"
      elsif obj == false
        "false"
      elsif obj.nil?
        "null"
      else
        to_json(obj.to_s)
      end
    end

    def stream_state
      sock = socket
      return unless sock
      payload = build_payload
      return unless payload
      line = to_json(payload) + "\n"
      begin
        sock.write_nonblock(line)
      rescue IO::WaitWritable
        # Socket buffer full, drop the frame to avoid lagging the game
      end
    rescue Errno::EPIPE, Errno::ECONNRESET, Errno::EBADF, IOError, SystemCallError
      close_socket!
    end

    def build_payload
      player = $player
      party = player && player.party ? player.party : []
      in_battle = false
      if $game_temp && $game_temp.respond_to?(:in_battle)
        in_battle = !!$game_temp.in_battle
      end
      battle_enemies = in_battle ? extract_battle_enemies : []
      battle_player = in_battle ? extract_battle_player : []
      {
        kind: "live_state",
        at: Time.now.to_f,
        trainer: player ? safe_string(player.name) : nil,
        party: party.map { |p| summarize_pokemon(p) }.compact,
        money: player ? safe_int(player.money) : 0,
        badges: player ? count_badges(player.badges) : 0,
        map_id: $game_map ? safe_int($game_map.map_id) : nil,
        map_name: $game_map && $game_map.respond_to?(:name) ? safe_string($game_map.name) : nil,
        x: $game_player ? safe_int($game_player.x) : nil,
        y: $game_player ? safe_int($game_player.y) : nil,
        play_time: $PokemonGlobal ? safe_int($PokemonGlobal.play_time) : 0,
        in_menu: scene_is_menu?,
        in_battle: in_battle,
        battle_enemies: battle_enemies,
        battle_player: battle_player,
      }
    end

    def summarize_pokemon(pkmn)
      return nil unless pkmn
      species = nil
      if pkmn.respond_to?(:species) && pkmn.species
        species = safe_string(pkmn.species)
      end
      level = pkmn.respond_to?(:level) ? safe_int(pkmn.level) : 1
      hp = pkmn.respond_to?(:hp) ? safe_int(pkmn.hp) : 0
      max_hp = pkmn.respond_to?(:totalhp) ? safe_int(pkmn.totalhp) : 1
      status = pkmn.respond_to?(:status) ? safe_int(pkmn.status) : 0
      moves = []
      if pkmn.respond_to?(:moves) && pkmn.moves
        pkmn.moves.each do |m|
          break if moves.size >= 4
          if m.is_a?(PokeBattle_Move)
            moves << (m.respond_to?(:id) ? safe_string(m.id) : m.to_s)
          elsif m.respond_to?(:id)
            moves << safe_string(m.id)
          else
            moves << m.to_s
          end
        end
      end
      type1 = nil
      type2 = nil
      if pkmn.respond_to?(:type1) && pkmn.type1
        type1 = safe_string(pkmn.type1)
      end
      if pkmn.respond_to?(:type2) && pkmn.type2
        type2 = safe_string(pkmn.type2)
      end
      {
        species: species,
        level: level,
        hp: hp,
        max_hp: max_hp,
        status: status,
        moves: moves,
        type1: type1,
        type2: type2,
      }
    end

    def safe_string(v)
      return nil if v.nil?
      v.respond_to?(:to_s) ? v.to_s : v.to_s
    rescue StandardError
      nil
    end

    def safe_int(v)
      return 0 if v.nil?
      Integer(v)
    rescue StandardError
      0
    end

    def count_badges(badges)
      return 0 unless badges
      if badges.is_a?(Array)
        badges.count { |b| b }
      else
        safe_int(badges)
      end
    end

    def scene_is_menu?
      scene = $scene
      return false unless scene
      klass = scene.class.name.to_s
      klass.start_with?("Scene_") &&
        (klass.include?("Menu") || klass.include?("Bag") || klass.include?("Party") ||
         klass.include?("Item") || klass.include?("Shop") || klass.include?("Save") ||
         klass.include?("Pause") || klass.include?("Title"))
    end

    def extract_battle_enemies
      enemies = []
      scene = $scene
      return enemies unless scene && scene.respond_to?(:battle)
      
      battle = scene.battle
      return enemies unless battle && battle.respond_to?(:battlers)
      
      battlers = battle.battlers
      return enemies unless battlers.is_a?(Array)
      
      battlers.each do |battler|
        next unless battler
        
        is_enemy = false
        if battler.respond_to?(:index)
          idx = battler.index
          is_enemy = idx.odd? if idx.is_a?(Integer)
        end
        
        if !is_enemy && battler.respond_to?(:opposes?)
          begin
            is_enemy = battler.opposes?
          rescue
          end
        end

        next unless is_enemy

        pkmn = nil
        if battler.respond_to?(:pokemon)
          begin
            pkmn = battler.pokemon
          rescue
          end
        end
        pkmn = battler if pkmn.nil?

        summary = summarize_pokemon(pkmn)
        if summary
          summary[:stages] = battler.respond_to?(:stages) && battler.stages ? battler.stages : [0, 0, 0, 0, 0, 0, 0]
          enemies << summary
        end
      end
      
      enemies
    rescue StandardError
      []
    end

    def extract_battle_player
      players = []
      scene = $scene
      return players unless scene && scene.respond_to?(:battle)
      
      battle = scene.battle
      return players unless battle && battle.respond_to?(:battlers)
      
      battlers = battle.battlers
      return players unless battlers.is_a?(Array)
      
      battlers.each do |battler|
        next unless battler
        
        is_player = false
        if battler.respond_to?(:index)
          idx = battler.index
          is_player = idx.even? if idx.is_a?(Integer)
        end
        
        if !is_player && battler.respond_to?(:opposes?)
          begin
            is_player = !battler.opposes?
          rescue
          end
        end

        next unless is_player

        pkmn = nil
        if battler.respond_to?(:pokemon)
          begin
            pkmn = battler.pokemon
          rescue
          end
        end
        pkmn = battler if pkmn.nil?

        summary = summarize_pokemon(pkmn)
        if summary
          summary[:stages] = battler.respond_to?(:stages) && battler.stages ? battler.stages : [0, 0, 0, 0, 0, 0, 0]
          players << summary
        end
      end
      
      players
    rescue StandardError
      []
    end

    def init_hooks
      return if @hooks_initialized
      # Wait until scripts have fully loaded
      return unless Object.const_defined?(:Scene_Title)
      @hooks_initialized = true

      send(:start_server) if respond_to?(:start_server, true) || defined?(start_server)

      if Object.const_defined?(:Scene_Title)
        Scene_Title.class_eval do
          if method_defined?(:update) && !method_defined?(:poke_stat_stream_title_orig_update)
            alias poke_stat_stream_title_orig_update update
            def update
              poke_stat_stream_title_orig_update
              PokeStatStream.close_socket!
            end
          end
        end
      end

      if Object.const_defined?(:PokeBattle_Battle)
        PokeBattle_Battle.class_eval do
          if method_defined?(:pbStartBattle) && !method_defined?(:poke_stat_stream_battle_orig_start)
            alias poke_stat_stream_battle_orig_start pbStartBattle
            def pbStartBattle(*args, &block)
              poke_stat_stream_battle_orig_start(*args, &block)
            end
          end
        end
      end
    end
  end
end

# Hook Graphics.update so we get a frame callback globally,
# covering the overworld, menus, and battles.
module Graphics
  class << self
    unless method_defined?(:_pokestat_original_update)
      alias _pokestat_original_update update
      def update
        PokeStatStream.init_hooks
        PokeStatStream.tick_frame!
        _pokestat_original_update
      end
    end
  end
end