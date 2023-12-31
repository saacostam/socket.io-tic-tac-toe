import {Server} from "socket.io";
import {Game} from "./src/classes/index.js";
import {config} from "dotenv";

config();

let onlineSocketIDs = [];
let onlineGames = [];

const PORT = +process.env.PORT || 3000;

const io = new Server({
    cors: process.env.CORS_ORIGIN,
});

io.on('connect', (socket) => {
    const getCurrentGame = () => {
        const currentGame = onlineGames.find(
            GAME => GAME.playersSocketIDs.some(
                IO_ID => IO_ID === socket.id
            )
        );

        console.log(`[GET-CURRENT-GAME-DEBUG] Current game ${
            JSON.stringify(currentGame)
        }`);

        return currentGame;
    }

    const handleOnGameDisconnection = (currentGame) => {
        onlineGames = onlineGames.filter(GAME => GAME !== currentGame);

        const socketIDsToDisconnect = currentGame.disconnect();
        socketIDsToDisconnect.forEach(
            (IO_ID) => {
                io.to(IO_ID).emit('left-game');

                console.log(`[LEAVE-GAME] ${
                    IO_ID
                } left his game. Number of current games: ${
                  onlineGames.length  
                }`);
            }
        );

        io.emit('updated-games', onlineGames);
    }

    onlineSocketIDs.push(socket.id);
    console.log(`[CONNECTION] New connection by ${
        socket.id
    }. Number of current connections: ${
        onlineSocketIDs.length
    }`);
    io.to(socket.id).emit('updated-games', onlineGames);

    socket.on('create-game', () => {
        const currentGame = getCurrentGame();
        if (currentGame) {
            io.to(socket.id).emit('denied-create');
            return;
        }

        const newGame = new Game(socket.id);
        onlineGames.push(newGame);
        console.log(`[CREATE-GAME] New game was created by ${
            socket.id
        }. Number of current games: ${
            onlineGames.length
        }`);
        io.to(socket.id).emit('create-success');
        io.emit('updated-games', onlineGames);
    });

    socket.on('join-game', (socketId) => {
        const gameToJoin = onlineGames
            .filter(GAME => !GAME.isGameInProgress)
            .find(
            GAME => GAME.playersSocketIDs.some(
                IO_ID => IO_ID === socketId
            )
        );

        console.log(`[JOIN-GAME] ${
            socket.id
        } tried to join game of ${
            socketId
        }`);

        if (gameToJoin){
            const socketIDsToStart = gameToJoin.startGame(socket.id);
            socketIDsToStart.forEach(
                IO_ID => {
                    io.to(IO_ID).emit('start-game');
                    io.to(IO_ID).emit('update-game-state', gameToJoin);
                }
            )

            console.log(`[JOIN-GAME] ${socket.id} Success! Alerting ${
                socketIDsToStart.join(' ')
            }`);
        }else{
            io.to(socket.id).emit('denied-game');
            console.log(`[JOIN-GAME] ${socket.id} Denied!`);
        }

        io.emit('updated-games', onlineGames);
    });

    socket.on('leave-game', () => {
        const currentGame = getCurrentGame();
        if (currentGame) handleOnGameDisconnection(currentGame);
    });

    socket.on('play', (updatedMinMatrix) => {
        const currentGame = getCurrentGame();

        if (!currentGame || !currentGame.playersSocketIDs.some(ID => ID === socket.id)){
            io.to(socket.id).emit('leave-game');
            return;
        }

        currentGame.grid = updatedMinMatrix;
        currentGame.turn = currentGame.playersSocketIDs.find(ID => ID !== currentGame.turn);
        currentGame.piece = currentGame.piece === 1 ? -1 : 1;
        currentGame.playersSocketIDs.forEach(
            ID => {
                io.to(ID).emit('update-game-state', currentGame)
            }
        )

        console.log(`[PLAY] Play from ${
            socket.id
        } to ${
            JSON.stringify(updatedMinMatrix)
        }`)
    })

    socket.on('disconnect', () => {
        const currentGame = getCurrentGame();

        console.log(`[DISCONNECTION-DEBUG] Current game ${
            JSON.stringify(currentGame)
        }`);

        if (currentGame) handleOnGameDisconnection(currentGame);
        onlineSocketIDs = onlineSocketIDs.filter(ID => ID !== socket.id);

        console.log(`[DISCONNECTION] Disconnection by ${
            socket.id
        }. Number of current connections: ${
            onlineSocketIDs.length
        }`);
    })
});

const TIMEOUT = 1000*(+process.env.TIMEOUT || 60 );
const keepAlive = () => {
    console.log(`[APP] ⏰  Current time: ${new Date().toString()}`);
    setTimeout(keepAlive, TIMEOUT);
}

try{
    io.listen(PORT);
    console.log(`[APP] 🚀 Server started in port ${PORT}`);
    keepAlive();
}catch (e){
    console.error(`[APP] ❌ Could not start server instance in port ${PORT}`);
    console.error(e);
}
