// Real-Time Carroms Multiplayer & Matchmaking Socket Service

class CarromSocketManager {
  constructor() {
    this.io = null;
    // Map of tier fee (50, 100, 500, 1000, 5000) -> Array of { socketId, userId, userName, userAvatar, entryFee, matchId, joinedAt }
    this.waitingQueues = new Map([
      [50, []],
      [100, []],
      [500, []],
      [1000, []],
      [5000, []],
    ]);
    // Map of socketId -> active matchRoom
    this.playerRooms = new Map();
  }

  setIO(io) {
    this.io = io;
  }

  removeFromAllQueues(socketId) {
    for (const [tier, queue] of this.waitingQueues.entries()) {
      const idx = queue.findIndex((p) => p.socketId === socketId);
      if (idx !== -1) {
        queue.splice(idx, 1);
        console.log(`🎯 Removed socket ${socketId} from Carroms tier ${tier} queue`);
      }
    }
  }

  handleConnection(socket) {
    // 1. Player joins matchmaking queue for chosen tier
    socket.on('carrom:find_match', (data = {}) => {
      const { entryFee = 100, userId = '', userName = 'Player', userAvatar = '', matchId = '' } = data;
      const fee = Number(entryFee);

      if (!this.waitingQueues.has(fee)) {
        this.waitingQueues.set(fee, []);
      }

      this.removeFromAllQueues(socket.id);

      const queue = this.waitingQueues.get(fee);

      // Check if an opponent is already waiting in this tier
      const opponentIdx = queue.findIndex(
        (p) => p.socketId !== socket.id && (!userId || p.userId !== userId)
      );

      if (opponentIdx !== -1) {
        // MATCH FOUND! Pair them up
        const opponent = queue.splice(opponentIdx, 1)[0];
        const matchRoom = `carrom_room_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        const opponentSocket = this.io.sockets.sockets.get(opponent.socketId);

        if (opponentSocket) {
          socket.join(matchRoom);
          opponentSocket.join(matchRoom);

          this.playerRooms.set(socket.id, matchRoom);
          this.playerRooms.set(opponent.socketId, matchRoom);

          const player1 = {
            socketId: opponent.socketId,
            userId: opponent.userId,
            name: opponent.userName || 'Chokku Master',
            avatar: opponent.userAvatar,
            color: 'white',
            role: 'player1',
          };

          const player2 = {
            socketId: socket.id,
            userId,
            name: userName || 'Chokku Challenger',
            avatar: userAvatar,
            color: 'black',
            role: 'player2',
          };

          console.log(`🎯 Carroms Match Made in tier ${fee}! Room: ${matchRoom}`);

          // Notify Player 1
          opponentSocket.emit('carrom:match_found', {
            matchRoom,
            entryFee: fee,
            prizePool: fee * 2,
            player1,
            player2,
            yourRole: 'player1',
            yourColor: 'white',
            firstTurn: 'player1',
            matchId: opponent.matchId || matchId,
          });

          // Notify Player 2
          socket.emit('carrom:match_found', {
            matchRoom,
            entryFee: fee,
            prizePool: fee * 2,
            player1,
            player2,
            yourRole: 'player2',
            yourColor: 'black',
            firstTurn: 'player1',
            matchId,
          });
        } else {
          // Stale opponent socket, enqueue current player instead
          queue.push({
            socketId: socket.id,
            userId,
            userName,
            userAvatar,
            entryFee: fee,
            matchId,
            joinedAt: Date.now(),
          });
          socket.emit('carrom:waiting_in_queue', { entryFee: fee, position: 1 });
        }
      } else {
        // No opponent waiting yet, add to queue
        queue.push({
          socketId: socket.id,
          userId,
          userName,
          userAvatar,
          entryFee: fee,
          matchId,
          joinedAt: Date.now(),
        });
        socket.emit('carrom:waiting_in_queue', { entryFee: fee, position: queue.length });
        console.log(`🎯 Socket ${socket.id} joined Carroms tier ${fee} waiting queue`);
      }
    });

    // 2. Cancel matchmaking queue
    socket.on('carrom:cancel_match', () => {
      this.removeFromAllQueues(socket.id);
      socket.emit('carrom:match_cancelled');
    });

    // 3. Sync striker baseline movement
    socket.on('carrom:striker_move', (data) => {
      if (data?.matchRoom) {
        socket.to(data.matchRoom).emit('carrom:opponent_striker_move', data);
      }
    });

    // 4. Sync aiming trajectory & power bar
    socket.on('carrom:aim', (data) => {
      if (data?.matchRoom) {
        socket.to(data.matchRoom).emit('carrom:opponent_aim', data);
      }
    });

    // 5. Fire shot
    socket.on('carrom:shoot', (data) => {
      if (data?.matchRoom) {
        socket.to(data.matchRoom).emit('carrom:opponent_shoot', data);
      }
    });

    // 6. Sync board state and scores after turn resolves
    socket.on('carrom:sync_state', (data) => {
      if (data?.matchRoom) {
        socket.to(data.matchRoom).emit('carrom:state_synced', data);
      }
    });

    // 7. Match completed notification
    socket.on('carrom:match_finished', (data) => {
      if (data?.matchRoom) {
        this.io.to(data.matchRoom).emit('carrom:game_over', data);
      }
    });

    // 8. Player disconnect cleanup
    socket.on('disconnect', () => {
      this.removeFromAllQueues(socket.id);

      const matchRoom = this.playerRooms.get(socket.id);
      if (matchRoom) {
        socket.to(matchRoom).emit('carrom:opponent_left', {
          message: 'Opponent disconnected. You win by forfeit!',
        });
        this.playerRooms.delete(socket.id);
      }
    });
  }
}

module.exports = new CarromSocketManager();

