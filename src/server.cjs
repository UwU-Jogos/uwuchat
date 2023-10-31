"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const lib_1 = __importDefault(require("./lib.cjs"));
const port = Number(process.argv[2] || "7171");
var RoomPosts = {};
var Watchlist = {};
var Connected = 0;
// Startup
// =======
// Creates the data directory
if (!fs_extra_1.default.existsSync("data")) {
    fs_extra_1.default.mkdirSync("data");
}
// Loads existing posts
var files = fs_extra_1.default.readdirSync("data");
for (var file of files) {
    if (file.slice(-5) === ".room") {
        var room_name = file.slice(0, -5);
        var file_data = fs_extra_1.default.readFileSync(path_1.default.join("data", file));
        var room_posts = [];
        for (let i = 0; i < file_data.length; i += 4 + size) {
            var size = lib_1.default.hex_to_u32(file_data.slice(i, i + 4).toString("hex"));
            var head = Buffer.from([lib_1.default.SHOW]);
            var body = file_data.slice(i + 4, i + 4 + size);
            room_posts.push(new Uint8Array(Buffer.concat([head, body])));
        }
        console.log(`Loaded ${room_posts.length} posts on room ${room_name}.`);
        RoomPosts[room_name] = room_posts;
    }
}
// Methods
// =======
// Returns current time
function get_time() {
    return Date.now();
}
// Adds a user to a room's watchlist
function watch_room(room_name, WebSocket) {
    // Creates watcher list
    if (!Watchlist[room_name]) {
        Watchlist[room_name] = [];
    }
    // Gets watcher list
    var watchlist = Watchlist[room_name];
    // Makes sure user isn't watching already
    for (var i = 0; i < watchlist.length; ++i) {
        if (watchlist[i] === WebSocket) {
            return;
        }
    }
    // Sends old messages
    if (RoomPosts[room_name]) {
        for (var i = 0; i < RoomPosts[room_name].length; ++i) {
            // WebSocket.send(Buffer.from(RoomPosts[room_name][i]).buffer);
            // WebSocket.send(RoomPosts[room_name][i].buffer);
            WebSocket.send(RoomPosts[room_name][i]);
        }
    }
    // Adds user to watcher list
    watchlist.push(WebSocket);
}
// Removes a user from a room's watchlist
function unwatch_room(room_name, WebSocket) {
    // Gets watcher list
    var watchlist = Watchlist[room_name] || [];
    // Removes user from watcher list
    for (var i = 0; i < watchlist.length; ++i) {
        if (watchlist[i] === WebSocket) {
            for (var j = i; j < watchlist.length - 1; ++j) {
                watchlist[j] = watchlist[j + 1];
            }
            return;
        }
    }
}
// Saves a post (room id, user address, data)
// Saves a post (room id, user address, data)
function save_post(post_room, post_user, post_data) {
    if (!post_room || !post_user || !post_data) {
        console.error("Invalid post information.");
        return;
    }
    var post_room = lib_1.default.check_hex(64, post_room);
    var post_time = lib_1.default.u64_to_hex(get_time());
    var post_user = lib_1.default.check_hex(64, post_user);
    var post_data = lib_1.default.check_hex(null, post_data);
    var valid_post_room = post_room;
    var valid_post_user = post_user;
    var valid_post_data = post_data;
    var post_list = [valid_post_room, post_time, valid_post_user, valid_post_data];
    var post_buff = lib_1.default.hexs_to_bytes([lib_1.default.u8_to_hex(lib_1.default.SHOW)].concat(post_list));
    var post_seri = lib_1.default.hexs_to_bytes([lib_1.default.u32_to_hex(post_buff.length - 1)].concat(post_list));
    var post_file = path_1.default.join("data", valid_post_room + ".room");
    var log_msg = "";
    log_msg += "Saving post!\n";
    log_msg += "- post_room: " + valid_post_room + "\n";
    log_msg += "- post_user: " + valid_post_user + "\n";
    log_msg += "- post_data: " + valid_post_data + "\n";
    log_msg += "- post_file: " + valid_post_room + ".room" + "\n";
    // Creates reconnection array for this room
    if (!RoomPosts[valid_post_room]) {
        RoomPosts[valid_post_room] = [];
    }
    // Adds post to reconnection array
    RoomPosts[valid_post_room].push(post_buff);
    // Broadcasts
    if (Watchlist[valid_post_room]) {
        log_msg += "- broadcasting to " + Watchlist[valid_post_room].length + " watcher(s).\n";
        for (var WebSocket of Watchlist[valid_post_room]) {
            WebSocket.send(post_buff);
        }
    }
    // Create file for this room
    if (!fs_extra_1.default.existsSync(post_file)) {
        fs_extra_1.default.closeSync(fs_extra_1.default.openSync(post_file, "w"));
    }
    // Adds post to file
    fs_extra_1.default.appendFileSync(post_file, Buffer.from(post_seri));
    // Log messages
    console.log(log_msg);
}
// TCP API
// =======
const WebSockets = new ws_1.default.Server({ port });
// WebSockets.binaryType = "arraybuffer";
WebSockets.on("connection", function connection(WebSocket) {
    console.log("[" + (++Connected) + " connected]");
    // WebSockets.on("message", function incoming(data: Iterable<number>) {
    WebSocket.on("message", function incoming(data) {
        var msge = new Uint8Array(data);
        switch (msge[0]) {
            // User wants to watch a room
            case lib_1.default.WATCH:
                var room = lib_1.default.bytes_to_hex(msge.slice(1, 9));
                watch_room(room, WebSocket);
                break;
            // User wants to unwatch a room
            case lib_1.default.UNWATCH:
                var room = lib_1.default.bytes_to_hex(msge.slice(1, 9));
                unwatch_room(room, WebSocket);
                break;
            // User wants to know the time
            case lib_1.default.TIME:
                var msge_buff = lib_1.default.hexs_to_bytes([
                    lib_1.default.u8_to_hex(lib_1.default.TIME),
                    lib_1.default.u64_to_hex(Date.now()),
                    lib_1.default.bytes_to_hex(msge.slice(1, 9)),
                ]);
                WebSocket.send(msge_buff);
                break;
            // User wants to post a message
            case lib_1.default.POST:
                var post_room = lib_1.default.bytes_to_hex(msge.slice(1, 9));
                var post_user = lib_1.default.bytes_to_hex(msge.slice(9, 17));
                var post_data = lib_1.default.bytes_to_hex(msge.slice(17, msge.length));
                save_post(post_room, post_user, post_data);
                break;
        }
    });
    WebSocket.on("close", function () {
        for (var room_name in Watchlist) {
            Watchlist[room_name] = Watchlist[room_name].filter((watcher) => watcher !== WebSocket);
        }
        console.log("[" + (--Connected) + " connected]");
    });
});
process.on("SIGINT", function () {
    console.log("\nClosing server...");
    WebSockets.close();
    process.exit();
});
console.log("Started server on WebSocket://localhost:" + port + ".");
