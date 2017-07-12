const path = require("path");
const express = require("express");
const cors = require("cors");
const favicon = require("serve-favicon");
const logger = require("morgan");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const expressValidator = require("express-validator");
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

function emitToGame(id, msg, data) {
    if (games[id] != 2) return;
    for (let i = 0; i < sockets.length; i++) {
        if (sockets[i].gameId == id) {
            io.to(sockets[i].socket.id).emit(msg, data);
        }
    }
}

io.on("connection", (socket) => {
    console.log("Client connected...", socket.id);
    let gameId; // Gets set once we join game.

    socket.on("error", function (err) {
        if (err.description) throw err.description;
        else throw err; // Or whatever you want to do
    });

    socket.on("join", (id) => {
        if (gameId == undefined) gameId = id;
        sockets.push({socket: socket, gameId: gameId});
        if (games[gameId] == undefined) games[gameId] = 0;
        games[gameId]++;

        // Check if both players are connected; if so emit message
        emitToGame(gameId, "message", {type: "state", msg: "ready"});
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
                if (data.promotion) {
                    msg.promotion = {};
                    msg.promotion.x = 7 - data.promotion.x;
                    msg.promotion.y = 7 - data.promotion.y;
                    msg.promotion.piece = data.promotion.piece;
                }
            }
        } else if (msg.type == "history") {
            msg.notation = data.notation;
        } else if (msg.type == "game-over") {
            msg.colorWon = data.colorWon;
            msg.quit = data.quit;
        } else if (msg.type == "accept-rematch") {

            // Corner-case, we send restart game to both clients.
            emitToGame(gameId, "message", {type: "state", msg: "restart"});
            return;
        }

        // Find other game-socket and emit msg
        for (let i = 0; i < sockets.length; i++) {
            if (sockets[i].gameId == gameId && sockets[i].socket.id != socket.id) {
                io.to(sockets[i].socket.id).emit("message", msg);
                break;
            }
        }
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected.", socket.id);

        // Find socket from array
        for (let i = 0; i < sockets.length; i++) {
            if (sockets[i].gameId == gameId && sockets[i].socket.id == socket.id)  {

                // Reduce game participant count
                //let gameId = sockets[i].gameId;
                games[gameId]--;
                console.log("Disconnected", gameId, games[gameId]);
                if (games[gameId] == 1) {

                    // Send message to other socket
                    let j = 1 - i;
                    let otherSocket = sockets[j].socket;
                    io.to(otherSocket.id).emit("message", {type: "opponent-dc"});
                } else if (games[gameId] == 0) {

                    // Connect to db and remove game from database
                    MongoClient.connect(mongoUrl, function(err, db) {
                        if (err) console.log("Unable to connect to the server", err);

                        // Remove game by its id
                        console.log("Attempting to remove " + gameId);
                        db.collection("games").remove({"_id": gameId});
                        db.close();
                    });
                    delete games[gameId];
                }

                // Remove from sockets
                sockets.splice(i, 1);
                break;
            }
        }
    });
});

app.use(logger("dev"));
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
app.use(function(req, res) {
    res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8"
    });
    res.end('API for Sjadam.<br><a href="https://github.com/JonasTriki/sjadam-api">https://github.com/JonasTriki/sjadam-api</a>');
});
