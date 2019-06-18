'use strict';

let CHUNKWORKERS;
let PLAYER = undefined;
const PLAYER_INFO = { pos: [0, 0, 0], lastStanding: [0, 0, 0] };
const GOALS = new Map();
const BUTTONS = new Map(); //instance = door, '[chunkpos]_[index]' = button

const LEVELS = {

    curr: {},

    currLevel: 1,
    addNew(blockId, n_level) {
        if (n_level === 0)
            return;

        this.create(n_level);

        return this.curr[n_level];
    },

    exchangeBlock(instance, newLevel, changeSpawn) {
        let props = INSTANCES.get(instance);
        let attr = UTILS.getAndDelete(this.curr[props[0]].movable, instance);
        let pos;

        props[0] = newLevel;

        if (changeSpawn) {
            pos = CUBE.pos.__getXYZ(instance);
        } else {
            pos = attr[0];
            props = JSON.parse(attr[1]); //keep old props but change level
            props[0] = newLevel;
        }

        this.addMovable(instance, props, pos);
    },

    removeBlock(instance, props, chunkName) {

        if (props === undefined) {
            console.error('couldnt remove block', instance, props);
            return;
        }

        if (instance === PLAYER) {

            console.log(chunkName);
            debugger;
        }

        let level = this.curr[props[0]];
        level.movable.delete(instance);

        //to refactor
        //check if door
        if (props[1] === 6) {
            for (let button of props[2]) {
                level.buttons.get(button).delete(instance);
            }
        } else if (props[1] === 3) {
            level.goals--;
        } else if (props[1] === 2 && props[2] === 3) {
            level.active--;
        }
    },

    clear() {
        // console.log('clearing');
        this.curr = {};
        this.create(0);
    },

    create(num) {

        if (this.curr[num] === undefined) {

            let curr = this.curr[num] = { goals: 0, active: 0, movable: new Map(), buttons: new Map(), done: undefined };
            let levelInfo = WORLD_INFO.levelInfo[num];

            if (levelInfo.s === 'b') {
                let buttonName = 'goal_' + num;
                curr.buttons.has(buttonName) || curr.buttons.set(buttonName, new Set());
                curr.done = buttonName;
            } else {
                curr.done = levelInfo.s;
            }
        }
    },

    addMovable(instance, props, pos) {
        this.curr[props[0]].movable.set(instance, [pos, JSON.stringify(props)]);
    }
}

const BLOCKTYPE = {
    white: UTILS.packColor(255, 255, 255),
    dark: UTILS.packColor(35, 35, 35),
    '-1': { color: UTILS.packColor(35, 35, 35) },
    0: { color: UTILS.packColor(255, 255, 255) }, //wall
    1: { fall: true, color: UTILS.packColor(243, 56, 166) }, //player
    2: { fall: true, color: UTILS.packColor(60, 60, 60) }, //box
    3: { offset: -1 / 5, color: UTILS.packColor(56, 193, 245), brightness: [70, 35, 35] }, //goal
    4: { offset: -1 / 5, color: UTILS.packColor(255, 245, 60), brightness: [50, 35, 35] }, //push_button
    // 5: { offset: -1 / 4, color: UTILS.packColor(255, 245, 60), brightness: [50, 35, 35] }, //toggle_button
    6: { color: UTILS.packColor(255, 255, 255) }, //door

    //wall
    f0: function({ changes }) {
        return Object.assign(changes, this[0]);
    },

    //player
    f1: function({ changes, instance, props, pos }) {
        PLAYER = instance;

        LEVELS.addMovable(instance, props, pos);

        CAMERA.setFogHeight(pos[1]);

        // CUBE.col.setX(instance, UTILS.packColor(243, 56, 166));

        return Object.assign(changes, this[1]);
    },

    //box
    f2: function({ changes, instance, props, pos }) {

        LEVELS.addMovable(instance, props, pos);

        if (props[2] === 3)
            LEVELS.curr[props[0]].active++;

        return Object.assign(changes, this[props[2]]);
    },

    //goal
    f3: function({ changes, props }) {

        LEVELS.curr[props[0]].goals++;
        return Object.assign(changes, this[3], { brightness: 0 });
    },

    //push_button
    f4: function({ changes, posChunk, index, props }) {
        let fullName = posChunk + '_' + index;

        LEVELS.curr[props[0]].buttons.has(fullName) || LEVELS.curr[props[0]].buttons.set(fullName, new Set());

        return Object.assign(changes, this[4], { brightness: 0 })
    },

    //door
    f6: function({ changes, instance, props, pos }) {

        LEVELS.addMovable(instance, props, pos);

        let buttons = props[2];

        for (let i = buttons.length; i--;) {
            let p = LEVELS.curr[props[0]].buttons.get(buttons[i]);

            if (p === undefined) {
                p = new Set();
                LEVELS.curr[props[0]].buttons.set(buttons[i], p); //add door pointer
            }

            p.add(instance);
        }

        return Object.assign(changes, this[6]);

        // let moves = props[4].map(f => UTILS.unpackMoves(f));
        // // add door info
        // BUTTONS.set(instance, { buttons: buttons, frame: props[3], moves: moves });
    }
}

const CALLBACKS = {
    emptyChunkLoaded({ chunkName }) {
        CHUNKS.set(chunkName, new Map())
    },

    chunkLoaded({ blocks, chunkPos: coord, lowest, chunkName }) {

        let ox = WORLD_INFO.x * coord[0],
            lx = WORLD_INFO.x + ox,
            oy = WORLD_INFO.y * coord[1],
            ly = WORLD_INFO.y + oy,
            oz = WORLD_INFO.z * coord[2],
            lz = WORLD_INFO.z + oz,
            currChunk = new Map();

        RAY.setBounds(oy, ly);

        CHUNKS.set('' + coord, currChunk);

        for (let [pos, props] of blocks) {

            if (props[1] === 1 && LEVELS.currLevel !== props[0]) {
                continue;
            }

            let instance = UTILS.getAndDelete(RECYCLE_BIN, coord + '_' + pos);

            if (instance === undefined) {
                instance = UTILS.shiftMap(RECYCLE_BIN);
            }

            if (instance !== undefined) {
                //LEVELS.removeInstance(INSTANCES.get(instance), instance);
            } else {
                instance = CUBE.geometry.maxInstancedCount++;
            }

            if (instance > WORLD_INFO.lastIndex) {
                WORLD_INFO.lastIndex = instance;
            }

            currChunk.set(pos, instance);

            let [px, py, pz] = idToWorldPos(coord, pos);

            CUBE._col.setX(instance, BLOCKTYPE.white);
            CUBE._time.setX(instance, CLOCK.time);
            CUBE.speed.setX(instance, WORLD_INFO.speed);

            let type = props[1] || 0;
            let level = LEVELS.addNew(instance, props[0]);

            let grow = WORLD_INFO.levelInfo[props[0]];
            let changes = {};
            let py_ = py;

            // if (grow.s) {// } //check if level is hidden

            if (TELEPORT.animate) {

                py_ = lowest[px + ',' + pz];

                if (py_ === undefined) {
                    py_ = WORLD_INFO.spawnHeight;
                    CUBE._col.setX(instance, BLOCKTYPE.dark);
                }

                let dist = py - py_;

                changes.move = [0, dist, 0];
                changes.delay = TELEPORT.delay * (px - TELEPORT.appearX + pz - TELEPORT.appearZ + py * 2);

                let secDelay;
                if (dist && 0 <= (secDelay = Math.round(changes.delay * 0.001 * 50) * 0.02) && CHUNKS_.inViewport(px, py, pz))
                    AUDIO.bufferPlay('slide', { delay: secDelay, volume: .008 });
            }

            BLOCKTYPE['f' + type]({
                changes: changes,
                instance: instance,
                props: props,
                posChunk: coord,
                index: pos,
                pos: [px, py, pz]
            });

            CUBE.pos.setXYZ(instance, px, py_, pz);
            CUBE._pos.setXYZ(instance, px, py_, pz);

            changeCube(instance, changes);

            INSTANCES.set(instance, props);
        }
    }
}

async function setupSavingSystem(workersAmt) {

    let status = await retrieveMap();
    console.log(status);

    CHUNKWORKERS = new WorkerPool('/js/chunkworker.js', function(e) {
        CALLBACKS[e.data.type](e.data.msg);
    }, workersAmt);

    let worldInfo = (await retrieveData({ key: 'worldInfo' })).backup;

    WORLD_INFO.x = worldInfo.chkX;
    WORLD_INFO.y = worldInfo.chkY;
    WORLD_INFO.z = worldInfo.chkZ;
    WORLD_INFO.levelInfo = worldInfo.levels;
}

function retrieveChunk(chunkCoords) {
    CHUNKWAITING.add(chunkCoords + '');
    CHUNKWORKERS.postMessage({ type: 'loadChunk', msg: { chunkCoord: chunkCoords, size: [WORLD_INFO.x, WORLD_INFO.y, WORLD_INFO.z] } });
}

function retrieveData({ name = 'appData', version = 1, type = 'readwrite', store = 'world', key }) {
    return new Promise(function(resolve, reject) {
        indexedDB.open(name, version).onsuccess = function(event) {

            let db = event.target.result,
                tx = db.transaction(store, type),
                st = tx.objectStore(store);

            st.get(key).onsuccess = function(event) {
                resolve(event.target.result)
            }

            tx.oncomplete = function(event) {
                console.log(key + ' retrieved');
                event.target.db.close();
            }
        }
    });
}

function retrieveMap() {
    return new Promise(function(resolve, reject) {
        let open = indexedDB.open("appData", 1);

        open.onupgradeneeded = function(event) {
            console.log('Building the map from server');

            let open = event.target;
            open.result.createObjectStore("world", { keyPath: "chunk" });

            open.onsuccess = async function(event) {

                let chunkData = await UTILS.readFile('../chunks.txt', 'json');
                let worldInfo = await UTILS.readFile('../worldinfo.txt', 'json');
                let chunks = { worldInfo: worldInfo };

                for (let key in chunkData) {
                    chunks[key] = new Map(chunkData[key]);
                }

                writeData('world', event, chunks, resolve);
            }
        }

        open.onsuccess = async function(event) {
            resolve('backup present');
        }
    });
}

function writeData(storeName, event, chunks, callback) {
    let keys = Object.keys(chunks);
    let db = event.target.result;
    let tx = db.transaction('world', 'readwrite');
    let store = tx.objectStore('world');

    putNext.call(store, 0);

    function putNext(i) {
        if (i < keys.length) {
            let curr = keys[i];
            this.put({ chunk: curr, backup: chunks[curr], current: chunks[curr] }).onsuccess = putNext.bind(this, ++i);
        }
    }

    tx.oncomplete = function(event) {
        callback('New map created');
        event.target.db.close();
    }

    event.target.onerror = function(event) {
        console.log('error'); // TransactionInactiveError
    }
}