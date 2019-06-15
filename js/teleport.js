'use strict';

let TELEPORT = {
    x: 0,
    z: 0,
    delay: 1 * 22,
    state: 0 //1 teleport, 2 appear level, 3 reload, 4 disappear level
};

let debugshit = 0;

function switchLevel(newLevel) {

    CAMERA.lock = !!newLevel; //lock if level 0 aka not level

    let o = {};
    [o.x, , o.z] = CAMERA.lock ? calcCenterLevel(newLevel) : CUBE.pos.__getXYZ(PLAYER);

    CAMERA.tPosition.x = o.x;
    CAMERA.tPosition.z = o.z;
    CAMERA.pan();
    console.log('switching level', newLevel);
    reloadLevel();
    LEVELS.currLevel = newLevel;
}

function reloadLevel() {

    if (!WORLD.interact)
        return;

    AUDIO.muteContinues();
    AUDIO.play('restart', { volume: .25, rate: 1.01 });

    //set player fist !!!!
    WORLD.interact = false;

    let level = LEVELS.curr[LEVELS.currLevel];
    level.active = 0;

    let refs = { moved: 0, _player: PLAYER, movable: level.movable, playerPos: instanceToWorldPos(PLAYER) };

    PLAYER = undefined;
    PUSHEDCUBES.clear();

    let movables = new Map(refs.movable); //clone movable blocks of level but ignore play block (getAndDelete)
    let refProps = UTILS.getAndDelete(movables, refs._player);

    if (refProps)
        respawnBlock(refs._player, ...refProps, refs, refs.playerPos);

    if (LEVELS.currLevel) {
        for (let [instance, [origPos, strProps]] of movables) {
            let currPos = instanceToWorldPos(instance);
            if (currPos + '' !== origPos + '')
                respawnBlock(instance, origPos, strProps, refs, currPos);
        }
    }
    //check movables
    finishReload(refs);
}

function respawnBlock(instance, origPos, strProps, refs, currPos) {
    refs.moved++;

    let [y, type_] = getLowest(currPos, refs.movable);
    let dist = y - currPos[1];
    let changes = Object.assign({}, BLOCKTYPE[type_], { brightness: 0, move: [0, dist, 0] });
    let [currChunk, currIndex] = worldPosToId(...currPos);

    currChunk && currChunk.delete(currIndex);
    // if (!(currChunk && currChunk.delete(currIndex))) {
    //     console.error(instance + ' was not deleted!!!');
    // };
    changes.delay = Math.hypot(refs.playerPos[0] - currPos[0], refs.playerPos[2] - currPos[2]) * TELEPORT.delay;

    let secDelay;
    if (dist && 0 <= (secDelay = Math.round(changes.delay * 0.001 * 50) * 0.02)) {
        AUDIO.bufferPlay('slide', { delay: secDelay, volume: 0.008 });
    }

    changeCube(instance, changes);

    CLOCK.setCallback(_ => {

        let [y_, type_] = getLowest(origPos, refs.movable);
        let attr = CUBE.instanceBuffer.__passAttributes(instance);
        attr[0] = BLOCKTYPE[type_].color;
        attr[1] = BLOCKTYPE[type_].color;
        attr[2] = attr[5] = origPos[0];
        attr[3] = attr[6] = y_;
        attr[4] = attr[7] = origPos[2];

        let [currChunk, currIndex] = worldPosToId(...origPos);
        currChunk && currChunk.set(currIndex, instance);

        let props = JSON.parse(strProps);
        let type = props[1] || 0;
        let dist = origPos[1] - y_;
        let changes = Object.assign({ move: [0, dist, 0] }, BLOCKTYPE[type]);

        if (dist) {
            AUDIO.bufferPlay('slide', { delay: 0, volume: 0.008 });
        }

        BLOCKTYPE['f' + type]({
            changes: changes,
            instance: instance,
            props: props,
            pos: origPos
        });

        INSTANCES.set(instance, props);
        changeCube(instance, changes);

        refs.moved--;
        finishReload(refs);

    }, WORLD_INFO.speed + changes.delay);

}

function finishReload(refs) {
    if (refs.moved)
        return;

    if (PLAYER === undefined)
        PLAYER = refs._player;

    WORLD.interact = true;
}

function getLowest(currPos, movable) {

    let y = currPos[1];
    let [chunk, pos] = worldPosToId(...currPos);

    if (chunk === undefined) {
        return [WORLD_INFO.spawnHeight, -1];
    }

    while (--y >= 0) {
        pos -= WORLD_INFO.x * WORLD_INFO.z;
        let hit = chunk.get(pos);
        if (hit !== undefined && !movable.has(hit))
            return [y, INSTANCES.get(hit)[1] || 0];
    }

    return [WORLD_INFO.spawnHeight, -1];
}

function loadLevel(num, waitEnd = true, animate = true) {
    WORLD.interact = false;

    LEVELS.currLevel = num;
    LEVELS.create(num);

    let levelInfo = WORLD_INFO.levelInfo[num];

    CAMERA.lock = !!num;

    TELEPORT.appearX = levelInfo.x;
    TELEPORT.appearZ = levelInfo.z;
    [TELEPORT.newPosX, , TELEPORT.newPosZ] = calcCenterLevel(num);
    TELEPORT.diffX = Math.round(TELEPORT.newPosX - CAMERA.position.x);
    TELEPORT.diffZ = Math.round(TELEPORT.newPosZ - CAMERA.position.z);
    TELEPORT.waitEnd = waitEnd;
    TELEPORT.animate = animate;

    CHUNKS_.getNeededChunks(TELEPORT.newPosX, TELEPORT.newPosZ);
}

function calcCenterLevel(num) {
    let levelInfo = WORLD_INFO.levelInfo[num];
    let amt = (levelInfo.h) * (CAMERA.oblique * .5) * .5; //offset with half the heights

    return [
        levelInfo.x + Math.floor(levelInfo.w / 2 - 0.5 - amt),
        undefined,
        levelInfo.z + Math.floor(levelInfo.l / 2 - 0.5 - amt)
    ]
}

const CHUNKS_ = {
    unloadList: 0,
    lowest: {},
    bounds: { left: 0, right: 0, top: 0, bottom: 0 },
    delay: 0,
    newChunks: new Map(),

    addChunk(data) {
        this.newChunks.set(data.chunkName, data.blocks);
        Object.assign(this.lowest, data.lowest);
    },

    loaded() {
        this.unloadList--;

        //when all chunks retrieved
        if (!this.unloadList) {
            this.delay = 0;
            this.setBounds();
            this.changePlace();

            let y = WORLD_INFO.y; //add height delay

            let delay = TELEPORT.waitEnd ? this.delay + WORLD_INFO.speed * 0.75 /*this.calcDelay(y)*/ : 0;

            CLOCK.setCallback(_ => {
                WORLD.render = false;
                this.setBounds();
                this.clearAllchunks();
                this.setNewChunks();
                WORLD.render = true;
                TELEPORT.animate = false;
            }, delay);
        }
    },

    clearAllchunks() {
        CUBE.geometry.maxInstancedCount = 0;
        PLAYER = undefined;
        INSTANCES.clear();
        LEVELS.clear();
        RECYCLE_BIN.clear();
    },

    setNewChunks() {

        CAMERA.moveTo({ x: TELEPORT.newPosX, z: TELEPORT.newPosZ });

        this.setBounds();

        TELEPORT.appearX = this.bounds.left;
        TELEPORT.appearZ = this.bounds.top;

        for (let [chunkName, chunk] of this.newChunks) {
            CALLBACKS.chunkLoaded({
                blocks: chunk,
                chunkPos: UTILS.stringToArray(chunkName),
                lowest: this.lowest,
                chunkName: chunkName
            });

            chunk.clear();
        }

        let interactDelay =
            TELEPORT.delay *
            (this.bounds.right - this.bounds.left + this.bounds.bottom - this.bounds.top) +
            WORLD_INFO.speed;

        CLOCK.setCallback(_ => {
            WORLD.interact = true;
        }, interactDelay * 0.5);

        this.lowest = {};
        this.newChunks.clear();
    },

    setBounds() {
        let h_width = CAMERA.viewWidth / WORLD_INFO.blockSize * .5,
            h_height = CAMERA.viewHeight / WORLD_INFO.blockSize * .5;
        // ob = CAMERA.oblique * WORLD_INFO.y; //oblique compensation

        this.bounds.left = CAMERA.position.x - h_width;
        this.bounds.top = CAMERA.position.z - h_height;
        this.bounds.right = CAMERA.position.x + h_width;
        this.bounds.bottom = CAMERA.position.z + h_height;
    },

    inViewport(x, y, z) {

        y *= CAMERA.oblique;
        x-=y;
        z-=y;

        if ( this.bounds.left < x == x < this.bounds.right &&
            this.bounds.top < z == z < this.bounds.bottom) {
            return true;
        }
    },

    changePlace() {

        let remains = {};
        let blocksX = Math.ceil(CAMERA.viewWidth / WORLD_INFO.blockSize);
        let blocksZ = Math.ceil(CAMERA.viewHeight / WORLD_INFO.blockSize);

        for (let [chunkName, chunk] of CHUNKS) {
            for (let [pos, instance] of chunk) {
                let coord = UTILS.stringToArray(chunkName);
                let [x, y, z] = idToWorldPos(coord, pos);

                let gridPos = (x + TELEPORT.diffX) + ',' + (z + TELEPORT.diffZ);
                let low = this.lowest[gridPos];

                let changes = {};

                if (low === undefined) {
                    low = WORLD_INFO.spawnHeight;
                    changes.color = BLOCKTYPE.dark;
                } else {
                    remains[gridPos] = low;
                    changes.color = BLOCKTYPE.white;
                }

                let dist = low - y;
                let viewportX = x - this.bounds.left;
                let viewportZ = z - this.bounds.top;

                changes.delay = TELEPORT.delay * (viewportX + viewportZ + y * 2);
                changes.move = [0, dist, 0];

                let secDelay;

                if (dist && 0 <= (secDelay = Math.round(changes.delay * 0.001 * 50) * 0.02) &&
                    this.inViewport(x, y, z)) {
                    AUDIO.bufferPlay('slide', { delay: secDelay, volume: 0.008 });
                    if (changes.delay > this.delay) {
                        this.delay = changes.delay;
                    }
                }

                changeCube(instance, changes);
            }

            chunk.clear();
        }

        CHUNKS.clear();
        this.lowest = remains;
    },

    computeOffsets(x, z) {
        let o = {};
        o.offsetX =
            Math.floor(
                (x + 0.5 + WORLD_INFO.oblique) /
                WORLD_INFO.x - CAMERA.viewWidth /
                WORLD_INFO.ratio_x * 0.5
            ) - WORLD_INFO.obliqueX;

        o.offsetZ =
            Math.floor(
                (z + 0.5 + WORLD_INFO.oblique) /
                WORLD_INFO.z - CAMERA.viewHeight /
                WORLD_INFO.ratio_z * 0.5
            ) - WORLD_INFO.obliqueZ;

        o.chunksX = CAMERA.viewWidth / WORLD_INFO.ratio_x + 1 + o.offsetX + WORLD_INFO.obliqueX;
        o.chunksZ = CAMERA.viewHeight / WORLD_INFO.ratio_z + 1 + o.offsetZ + WORLD_INFO.obliqueZ;
        return o;
    },

    getNeededChunks(x, z) {
        let o = this.computeOffsets(x, z);
        for (let x = o.offsetX; x < o.chunksX; x++) {
            for (let z = o.offsetZ; z < o.chunksZ; z++) {
                this.unloadList++;
                this.getChunkData([x, 0, z]);

            }
        }

    },

    update(x, z) {
        let o = this.computeOffsets(x, z);

        if (o.offsetX !== WORLD_INFO.offsetX ||
            o.offsetZ !== WORLD_INFO.offsetZ ||
            o.chunksX !== WORLD_INFO.chunksX ||
            o.chunksZ !== WORLD_INFO.chunksZ) {

            WORLD_INFO.offsetX = o.offsetX;
            WORLD_INFO.offsetZ = o.offsetZ;
            WORLD_INFO.chunksX = o.chunksX;
            WORLD_INFO.chunksZ = o.chunksZ;

            let currentChunks = new Set(CHUNKS.keys());

            for (let x = o.offsetX; x < o.chunksX; x++) {
                for (let z = o.offsetZ; z < o.chunksZ; z++) {

                    if (!currentChunks.delete('' + [x, 0, z])) { //don't load chunk if delete returns false
                        retrieveChunk([x, 0, z]);
                    }
                }
            }

            for (let chunkName of currentChunks) {
                this.recycle(chunkName);
            }
        }
    },

    recycle(chunkName) {

        let chk = CHUNKS.get(chunkName),
            position,
            instance;

        if (chk === undefined)
            return;

        for ([position, instance] of chk) {
            LEVELS.removeBlock(instance, UTILS.getAndDelete(INSTANCES, instance), chunkName);

            if (instance >= WORLD_INFO.lastIndex) {
                WORLD_INFO.lastIndex--;
                CUBE.geometry.maxInstancedCount--;
            } else {
                RECYCLE_BIN.set(chunkName + '_' + position, instance);
            }
        }

        chk.clear();
        CHUNKS.delete(chunkName);
    },

    getChunkData(chunkCoords) {
        CHUNKWORKERS.postMessage({
            type: 'loadChunkData',
            msg: {
                chunkCoord: chunkCoords,
                size: [WORLD_INFO.x, WORLD_INFO.y, WORLD_INFO.z]
            }
        });
    },
}

CALLBACKS.chunkDataLoaded = function(data) {
    CHUNKS_.addChunk(data);
    CHUNKS_.loaded();
};

CALLBACKS.emptyChunkDataLoaded = function(data) {
    CHUNKS_.loaded();
};