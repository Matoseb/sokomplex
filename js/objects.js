'use strict';

const CLOCK = {

    callbacks: new Map(),
    time: 0,
    deltaTime: 0,
    absTime: 0,
    stopped: false,
    // current time, absTime, _absTime, deltaTime

    init() {
        this.absTime = performance.now();
    },

    setCallback(callback, delay = 0) {
        let key = Symbol();
        this.callbacks.set(key, [delay + this.time, callback]);
        return key;
    },

    pause() {
        this.stopped = true;
    },

    toggle() {
        this.stopped = !this.stopped;
        console.log(this.stopped);
    },

    resume() {
        this.stopped = false;
    },

    update() {
        const time = performance.now();
        this.deltaTime = time - this.absTime;
        this.absTime = time;

        if (this.stopped)
            return;

        for (let [key, value] of this.callbacks) {
            if (value[0] <= this.time) {
                value[1]();
                this.callbacks.delete(key);
            }
        }

        this.time += this.deltaTime;
    }
}

const MOUSE = {
    force: { x: 0, z: 0 },
    force3d: { x: 0, y: 0, z: 0 },
    pos3d: { x: 0, y: 0, z: 0 },
    player3d: { x: 0, y: 0, z: 0 },
    ezPos3d: { x: 0, y: 0, z: 0, amt: 1 },
    dragged: 0, //bigger than 2 not click
    x: 0,
    y: 0,
    target: undefined,
    pressed: 0,
    needsUpdate: 0,
    reset: true,

    updateEzPos() {
        this.ezPos3d.z = UTILS.lerp(this.ezPos3d.z, this.pos3d.z, this.ezPos3d.amt);
        this.ezPos3d.x = UTILS.lerp(this.ezPos3d.x, this.pos3d.x, this.ezPos3d.amt);
    },

    down(e) {
        this.dragged = 0;
        this.needsUpdate = this.pressed = 1;
        this.update(e);
    },


    move(e) {
        this.dragged++;
    },

    up(e) {

        this.ezPos3d.amt = 1;
        this.pressed = 0;
    },

    updateForces() {
        this.force.x = UTILS.lerp(this.force.x, this.x, 0.1);
        this.force.z = UTILS.lerp(this.force.z, this.y, 0.1);

        let way = this.pressed > 0 ? 1 : -1;
        this.force3d.y = UTILS.clamp(this.force3d.y + 0.05 * way, 0, .4);
        this.force3d.x = (this.force.x - this.x) * 0.2 * this.force3d.y;
        this.force3d.z = (this.force.z - this.y) * 0.2 * this.force3d.y;

        //update 3d mouse position
        if (this.needsUpdate && this.pressed) {

            this.target = RAY.cast();

            if(PUSHEDCUBES.get(this.target)) {
                this.target = undefined;
            }
            // highlightCube(c);

            this.updateEzPos();
            this.ezPos3d.amt = 0.2;
        } else {
            this.updateEzPos();
        }

        this.needsUpdate = 0;
    },

    update(e) {
        // if (!this.pressed)
        //     return;
        this.x = e.clientX / (CAMERA.zoom * DOM.width * 0.5);
        this.y = e.clientY / (CAMERA.zoom * CAMERA.aspect * DOM.height * 0.5);

        if (this.reset) {
            this.force.x = this.x;
            this.force.z = this.y;
            this.reset = false;
        }
    }
}


const RAY = {

    cast() {

        let curr,
            offX =
            1 / CAMERA.zoom -
            CAMERA.oblique * 0.5 -
            CAMERA.position.x +
            MOUSE.force3d.y * CAMERA.oblique,

            offZ =
            1 / (CAMERA.aspect * CAMERA.zoom) -
            CAMERA.oblique * 0.5 -
            CAMERA.position.z +
            MOUSE.force3d.y * CAMERA.oblique;

        this.mouseY = CAMERA.fogHeight - CAMERA.fogOffset; //get player position
        this.mouseX = MOUSE.x + CAMERA.oblique * this.mouseY - offX;
        this.mouseZ = MOUSE.y + CAMERA.oblique * this.mouseY - offZ;
        this.checkSides();

        MOUSE.player3d.x = this.mouseX + this.sideX;
        MOUSE.player3d.y = this.mouseY;
        MOUSE.player3d.z = this.mouseZ + this.sideZ;

        this.mouseY = WORLD_INFO.maxHeight;

        while (curr === undefined && this.mouseY >= WORLD_INFO.minHeight) {

            this.mouseX = MOUSE.x + CAMERA.oblique * this.mouseY - offX;
            this.mouseZ = MOUSE.y + CAMERA.oblique * this.mouseY - offZ;

            curr = this.checkSides();

            --this.mouseY;
        }

        if (curr === undefined) {
            Object.assign(MOUSE.pos3d, MOUSE.player3d);
        } else {
            MOUSE.pos3d.x = this.mouseX + this.sideX;
            MOUSE.pos3d.y = this.mouseY;
            MOUSE.pos3d.z = this.mouseZ + this.sideZ;
        }

        return curr;
    },


    //SIDES lookup table
    2: [-1, 0], //0b010 LEFT
    5: [0, -1], //0b101 TOP
    6: [-1, 0, 0], //0b110 LEFT CORNER, last parameter for fallback getInst([-1,-1])
    7: [0, -1, 0], //0b111 TOP CORNER


    getInst(side) {

        let [chunk, id] = worldPosToId(this.intX + side[0], this.mouseY, this.intZ + side[1]),
            curr = chunk && chunk.get(id);

        if (side.length > 2 && curr === undefined)
            return this.getInst([-1, -1]);

        this.sideX = side[0];
        this.sideZ = side[1];

        return curr;
    },

    setBounds(min, max) {
        if (max > WORLD_INFO.maxHeight)
            WORLD_INFO.maxHeight = max - 1;

        if (min < WORLD_INFO.minHeight)
            WORLD_INFO.minHeight = min;
    },

    checkSides() {

        let h_mouseX = this.mouseX + .5,
            h_mouseY = this.mouseZ + .5;

        this.intX = Math.floor(h_mouseX);
        this.intZ = Math.floor(h_mouseY);

        let curr = this.getInst([0, 0]);

        if (curr === undefined) {
            let b = 0,
                normX = UTILS.mod(h_mouseX, 1) / CAMERA.oblique,
                normZ = UTILS.mod(h_mouseY, 1) / CAMERA.oblique;

            if (normZ / normX < 1) //isCornerTop
                b |= 1 << 0;
            if (normX < 1) //isLeft
                b |= 1 << 1;
            if (normZ < 1) //isTop
                b |= 1 << 2;

            curr = this[b] && this.getInst(this[b]);
        }

        return curr;
    }
}

const KEYBOARD = {

    pressed: false,
    keys: new Map(),

    update() {
        for (let [key, value] of this.keys) {
            if (key in this) {
                if (++value >= (this[key](key) || Infinity)) {
                    this.keys.delete(key);
                } else {
                    this.keys.set(key, value);
                }
            }
        }
    },

    down(e) {
        if (this.pressed)
            return;

        this.keys.set(e.key, 0);
        this.pressed = true;
    },

    reset() { this.keys.clear() },

    up(e) {
        this.keys.delete(e.key);
        this.pressed = false;
    },

    q() {
        // CAMERA.position.y += CAMERA.speed;
        CAMERA.proportionalZoom(0.001);
        WORLD_INFO.setChunkConst();
    },

    f(key) {
        console.log('nani', this.keys.get(key));
        CLOCK.toggle();

        return 1;
    },

    e() {
        // CAMERA.position.y -= CAMERA.speed;
        CAMERA.proportionalZoom(-0.001);
        WORLD_INFO.setChunkConst();
    },

    r() {
        reloadLevel();
        return 1;
    },

    '1'() {
        loadLevel(1);
        return 1;
    },

    '2'() {
        loadLevel(2);
        return 1;
    },

    '3'() {
        loadLevel(3);
        return 1;
    },

    speed: 0.1,

    ArrowRight() {
        CAMERA.moveTo({x: CAMERA.tPosition.x + this.speed}, true);
    },

    ArrowLeft() {
        CAMERA.moveTo({x: CAMERA.tPosition.x - this.speed}, true);
    },

    ArrowUp() {
        CAMERA.moveTo({z:CAMERA.tPosition.z - this.speed}, true);
    },

    ArrowDown() {
        CAMERA.moveTo({z: CAMERA.tPosition.z + this.speed}, true);
    },

}