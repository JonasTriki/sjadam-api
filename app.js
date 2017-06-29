const path = require("path");
const express = require("express");
const cors = require("cors");
const favicon = require('serve-favicon');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const expressValidator = require('express-validator');
const MongoClient = require("mongodb").MongoClient;
const mongoUrl = "mongodb://localhost:27017/sjadam";

const game = require("./routes/game");
const join = require("./routes/join");

const app = express();
const http = require("http");
const port = 8080;
const server = http.Server(app).listen(port);
console.log("Server started.");

// Socket.io set-up
const io = require("socket.io").listen(server);
let games = {}, sockets = [];
io.on("connection", (socket) => {
    console.log("Client connected...", socket.id);

    socket.on('error', function (err) {
        if (err.description) throw err.description;
        else throw err; // Or whatever you want to do
    });

    socket.on("join", (gameId) => {
        sockets.push({socket: socket, gameId: gameId});
        if (games[gameId] == undefined) games[gameId] = 0;
        games[gameId]++;

        // Check if both players are connected; if so emit message
        if (games[gameId] == 2) {
            for (let i = 0; i < sockets.length; i++) {
                if (sockets[i].gameId == gameId) {
                    io.to(sockets[i].socket.id).emit("message", {type: "state", msg: "ready"});
                }
            }
        }
        console.log("Joined game " + gameId, "Count: " + games[gameId]);
    });

    socket.on("data", (data) => {

        // Figure out what we need to send back to other socket.
        let msg = {type: data.type};
        if (msg.type == "move" || msg.type == "remove") {

            // We need to flip the coordinates, since we flip the board for the opponent.
            // x and y are both in data.type == "remove" and "move"
            msg.x = 7 - data.x;
            msg.y = 7 - data.y;
            if (msg.type == "move") {
                msg.dX = 7 - data.dX;
                msg.dY = 7 - data.dY;
            }
        } else if (msg.type == "history") {
            msg.notation = data.notation;
        }
        
        // Find other game-socket and emit msg
        for (let i = 0; i < sockets.length; i++) {
            if (sockets[i].socket.id != socket.id) {
                io.to(sockets[i].socket.id).emit("message", msg);
                break;
            }
        }
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected.", socket.id);

        // Find socket from array
        for (let i = 0; i < sockets.length; i++) {
            if (sockets[i].socket.id == socket.id)  {

                // Reduce game participant count
                let gameId = sockets[i].gameId;
                games[gameId]--;
                console.log("Disconnected", gameId, games[gameId]);
                if (games[gameId] == 1) {
                    // TODO: Send message to other socket
                } else if (games[gameId] == 0) {
                    delete games[gameId];
                }

                // Remove from sockets
                sockets.splice(i, 1);
                break;
            }
        }
    });
});

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(expressValidator({
    customValidators: {
        isColor: function(color) {
            if (color === undefined) {
                return false;
            }
            return color === "w" || color === "b";
        },
        isUuidV4: function(uuid) {
            if (uuid === undefined) {
                return false;
            }
            let regex = /^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;
            return regex.test(uuid);
        },
        isGameId: function(id) {
            if (id === undefined) {
                return false;
            }
            let regex = /^[0-9a-z]{10}$/;
            return regex.test(id);
        }
    }
}));
app.use(cookieParser());
app.use(cors());

app.use("/game", game);
app.use("/", join);
