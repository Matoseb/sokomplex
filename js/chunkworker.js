'use strict';

let APPDATA = loadData("appData", 1).then(function(data) {
    APPDATA = data.result;
});

const CALL = {

    async loadChunkData({ chunkCoord, size }) {
        await APPDATA;

        let chunkName = chunkCoord + '';

        APPDATA.transaction('world', 'readonly').objectStore('world').get(chunkName).onsuccess = function(event) {
            let result = event.target.result;
            if (result !== undefined) {

                postMessage({
                    type: 'chunkDataLoaded',
                    msg: {
                        chunkName: chunkName,
                        chunkPos: stringToArray(result.chunk),
                        blocks: result.backup,
                        lowest: getLowestY(result.backup, size, stringToArray(result.chunk))
                    }
                });
            } else {
                postMessage({
                    type: 'emptyChunkDataLoaded',
                    msg: {
                        chunkName: chunkName,
                    }
                });
            }
        }
    },

    async loadChunk({ chunkCoord, size }) {
        await APPDATA;

        let chunkName = chunkCoord + '';

        APPDATA.transaction('world', 'readonly').objectStore('world').get(chunkName).onsuccess = function(event) {
            let result = event.target.result;
            if (result !== undefined) {

                postMessage({
                    type: 'chunkLoaded',
                    msg: {
                        chunkName: chunkName,
                        chunkPos: stringToArray(result.chunk),
                        blocks: result.backup,
                        lowest: {} //getLowestY(result.backup, size, stringToArray(result.chunk))
                    }
                });
            } else {
                postMessage({
                    type: 'emptyChunkLoaded',
                    msg: {
                        chunkName: chunkName,
                    }
                });
            }
        }
    },

    unloadChunk() {
        postMessage({ type: 'chunkUnloaded', msg: 0 });
    }
}

//movable blocks

//level blocks for appearlevel
function getLowestY(chunk, size, coord) {
    let cx = coord[0] * size[0],
        cz = coord[2] * size[2],
        sx = size[0],
        sy = size[1],
        sz = size[2],
        sxsz = size[2] * sx,
        lowest = {};

    for (let x = sx; x--;) {
        let cxx = x + cx;
        for (let z = sz; z--;) {
            let xz = x + z * sx,
                czz = z + cz;
            for (let y = 0; y < sy; y++) {
                // let instance = chunk.get(xz + y * sxsz);
                if (chunk.get(xz + y * sxsz)) {
                    // if (instance && instance[0]) {
                    lowest[cxx + ',' + czz] = y;
                    break;
                }
            }
        }
    }

    return lowest;
}

function idToWorldPos(chunk, id, size) {

    let pos = idToChunkPos(id, size);

    return [
        pos[0] + chunk[0] * size[0],
        pos[1] + chunk[1] * size[1],
        pos[2] + chunk[2] * size[2]
    ]
}


function idToChunkPos(id, size) {
    return [
        id % size[0],
        ~~(id / (size[0] * size[2])),
        ~~(id / size[0]) % size[2]
    ]
}

onmessage = function(e) {
    CALL[e.data.type](e.data.msg);
}

//methods
function loadData(name, version) {
    return new Promise(function(resolve, reject) {
        indexedDB.open(name, version).onsuccess = function(event) {
            resolve(event.target);
        }
    });
}

function stringToArray(s) {
    let a = s.split(',');
    return [+a[0], +a[1], +a[2]];
    // return Function('return [' + s + ']')();
}