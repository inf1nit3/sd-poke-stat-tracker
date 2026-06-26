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

require "socket"
require "json"

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

    def stream_state
      sock = socket
      return unless sock
      payload = build_payload
      return unless payload
      line = JSON.generate(payload)
      sock.write(line)
      sock.write("\n")
    rescue Errno::EPIPE, Errno::ECONNRESET, Errno::EBADF, IOError
      close_socket!
    end

    def build_payload
      player = $player
      party = player && player.party ? player.party : []
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
  end
end

# Hook Scene_Map#update so we get a frame callback whenever the player
# is in the overworld. We also hook SceneMenuBase variants if Essentials
# provides them, but Scene_Map covers the main case (most of gameplay
# happens there).
class Scene_Map
  if method_defined?(:update) || private_method_defined?(:update)
    alias poke_stat_stream_orig_update update
  end
  def update
    poke_stat_stream_orig_update if respond_to?(:poke_stat_stream_orig_update, true)
    PokeStatStream.tick_frame!
  end
end

# Reset state on game load so the next session reconnects cleanly.
class Scene_Title
  if method_defined?(:update) || private_method_defined?(:update)
    alias poke_stat_stream_title_orig_update update
  end
  def update
    poke_stat_stream_title_orig_update if respond_to?(:poke_stat_stream_title_orig_update, true)
    PokeStatStream.close_socket!
  end
end