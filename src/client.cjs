"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const WebSocket = require("isomorphic-ws");
const lib_1 = __importDefault(require("./lib.cjs"));
function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}
function client({ url = "WebSocket://localhost:7171" } = {}) {
    const ws = new WebSocket(url);
    const watching = {};
    function ws_send(buffer) {
        if (ws.readyState === 1) {
            ws.send(buffer);
        }
        else {
            setTimeout(() => ws_send(buffer), 20);
        }
    }
    let last_ask_time = null;
    let last_ask_numb = 0;
    let best_ask_ping = Infinity;
    let delta_time = 0;
    let ping = 0;
    let on_init_callback = null;
    let on_post_callback = null;
    function on_init(callback) {
        on_init_callback = callback;
    }
    function on_post(callback) {
        on_post_callback = callback;
    }
    function send_post(post_room, post_user, post_json) {
        const postRoom = lib_1.default.u64_to_hex(post_room);
        const postUser = lib_1.default.u64_to_hex(post_user);
        const post_data = lib_1.default.json_to_hex(post_json);
        const msge_buff = lib_1.default.hexs_to_bytes([
            lib_1.default.u8_to_hex(lib_1.default.POST),
            postRoom,
            postUser,
            post_data,
        ]);
        ws_send(msge_buff);
    }
    function watch_room(room_id) {
        if (!watching[room_id]) {
            watching[room_id] = true;
            const msge_buff = lib_1.default.hexs_to_bytes([
                lib_1.default.u8_to_hex(lib_1.default.WATCH),
                lib_1.default.u64_to_hex(room_id),
            ]);
            ws_send(msge_buff);
        }
    }
    function unwatch_room(room_id) {
        if (watching[room_id]) {
            watching[room_id] = false;
            const msge_buff = lib_1.default.hexs_to_bytes([
                lib_1.default.u8_to_hex(lib_1.default.UNWATCH),
                lib_1.default.u64_to_hex(room_id),
            ]);
            ws_send(msge_buff);
        }
    }
    function get_time() {
        return Date.now() + delta_time;
    }
    function ask_time() {
        last_ask_time = Date.now();
        last_ask_numb = ++last_ask_numb;
        ws_send(lib_1.default.hexs_to_bytes([
            lib_1.default.u8_to_hex(lib_1.default.TIME),
            lib_1.default.u64_to_hex(last_ask_numb),
        ]));
    }
    function roller({ room, user, on_init, on_pass, on_post, on_tick, }) {
        let state = null;
        watch_room(room);
        if (on_tick !== undefined) {
            const fps = on_tick[0];
            on_pass = function (state, time, dt) {
                const init_tick = Math.floor((time + 0) * fps);
                const last_tick = Math.floor((time + dt) * fps);
                for (let t = init_tick; t < last_tick; ++t) {
                    state = on_tick[1](state);
                }
                return state;
            };
        }
        on_post_callback = function (post) {
            if (state === null) {
                state = {
                    time: post.time,
                    value: on_init(post.time / 1000, post.user, post.data),
                };
            }
            else {
                state.value = on_pass(state.value, state.time / 1000, (post.time - state.time) / 1000);
                state.value = on_post(state.value, post.time / 1000, post.user, post.data);
                state.time = post.time;
            }
        };
        return {
            post: (data) => {
                return send_post(room, user, data);
            },
            get_state: () => {
                if (state) {
                    const send_state = clone(state);
                    return on_pass(send_state.value, send_state.time / 1000, (get_time() - send_state.time) / 1000);
                }
                else {
                    return null;
                }
            },
            get_time: () => {
                return get_time();
            },
            get_ping: () => {
                return ping;
            },
            destroy: () => {
                unwatch_room(room);
            },
        };
    }
    ws.binaryType = "arraybuffer";
    ws.onopen = function () {
        if (on_init_callback) {
            on_init_callback();
        }
        setTimeout(ask_time, 0);
        setTimeout(ask_time, 500);
        setTimeout(ask_time, 1000);
        setInterval(ask_time, 2000);
    };
    ws.onmessage = (msge) => {
        const msgeData = new Uint8Array(msge.data);
        if (msgeData[0] === lib_1.default.SHOW) {
            const room = lib_1.default.hex_to_u64(lib_1.default.bytes_to_hex(msgeData.slice(1, 9)));
            const time = lib_1.default.hex_to_u64(lib_1.default.bytes_to_hex(msgeData.slice(9, 17)));
            const user = lib_1.default.hex_to_u64(lib_1.default.bytes_to_hex(msgeData.slice(17, 25)));
            const data = lib_1.default.hex_to_json(lib_1.default.bytes_to_hex(msgeData.slice(25, msgeData.length)));
            if (on_post_callback) {
                on_post_callback({ room, time, user, data });
            }
        }
        if (msgeData[0] === lib_1.default.TIME) {
            const reported_server_time = lib_1.default.hex_to_u64(lib_1.default.bytes_to_hex(msgeData.slice(1, 9)));
            const reply_numb = lib_1.default.hex_to_u64(lib_1.default.bytes_to_hex(msgeData.slice(9, 17)));
            if (last_ask_time !== null && last_ask_numb === reply_numb) {
                ping = (Date.now() - last_ask_time) / 2;
                const local_time = Date.now();
                const estimated_server_time = reported_server_time + ping;
                if (ping < best_ask_ping) {
                    delta_time = estimated_server_time - local_time;
                    best_ask_ping = ping;
                }
            }
        }
    };
    return {
        roller,
        on_init,
        on_post,
        send_post,
        watch_room,
        unwatch_room,
        get_time,
        lib: lib_1.default,
    };
}
exports.default = client;
