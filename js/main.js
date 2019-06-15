'use strict';

if (WEBGL_.isWebGLAvailable() === false) {
    document.body.appendChild(WEBGL_.getWebGLErrorMessage());
}

const DOM = {
    width: 0,
    height: 0,
    debug: false,
}

const WORLD = {
    render: true,
    interact: false,
    //renderer, scene, stats
}

let CAMERA;

const WORLD_INFO = {
    depthFactor: 44,
    spawnHeight: -2,
    x: 4, //chunk Width
    y: 4, //chunk Height
    z: 4, //chunk Length
    maxHeight: 0,
    minHeight: 0,
    lastIndex: 0,

    buttonOffset: -1 / 4,
    goalOffset: -1 / 4,
    speed: 222,

    setChunkConst() {
        this.blockSize = CAMERA.zoom * DOM.width * 0.5;
        this.ratio_x = this.blockSize * this.x;
        this.ratio_z = this.blockSize * this.z;
        this.oblique = CAMERA.oblique * (this.y - 1) + CAMERA.oblique * 0.5;
        this.obliqueX = Math.ceil(this.oblique / this.x);
        this.obliqueZ = Math.ceil(this.oblique / this.z);
    }
}

const CUBE = {
    maxInstances: 350 * 350,
    //current: current mouse highlight cube
    //cube common: material, geometry, mesh,
    //cube instance: instanceBuffer, _col, col, _pos, pos, _time, speed,
}

const CHUNKS = new Map();
const CHUNKWAITING = new Set();
const RECYCLE_BIN = new Map();
const INSTANCES = new Map();

// let CHUNKWORKERS;

function checkCheat(e) {
    if (e.deltaY < 0 && document.activeElement !== DOM.input && e.clientX > window.innerWidth - 150 && e.clientY > window.innerHeight - 150) {
        DOM.input.focus();
        DOM.input.value = '';
        DOM.container.setAttribute("style", "opacity: 0.1; pointer-events: none;");
        DOM.input.onkeypress = function(e) {
            if (e.key === 'Enter') {
                if (!isNaN(this.value)) {
                    let value = +this.value;

                    if (value === 0) {
                        window.location.reload(true);
                    } else if (value in WORLD_INFO.levelInfo) {
                        loadLevel(value);
                    }

                    this.blur();

                } else {
                    switch (this.value) {
                        case 'm':

                            UTILS.toggleHash('#nomusic');
                            this.blur();
                            break;
                    }
                }
                this.value = '';
            }
        }

        DOM.input.onblur = function() {
            DOM.container.removeAttribute('style');
            this.onblur = this.onkeypress = null;
        }
    }
}

async function init() {

    DOM.input = document.querySelector('input');
    DOM.container = document.getElementById('container');

    setupScene();
    BRUTEFORCE.init(30);

    indexedDB.deleteDatabase("appData");
    await setupSavingSystem(2);

    WORLD_INFO.setChunkConst();

    window.addEventListener('resize', onWindowResize, false);
    window.matchMedia('(orientation: portrait)').addListener(_ => { //home app ios debouncing rotating screen
        CLOCK.setCallback(_ => {
            let c = DOM.container;
            if (c.offsetWidth !== c.offsetHeight && DOM.width === c.offsetWidth)
                return 'retry';
            onWindowResize();
        });
    });

    document.addEventListener('wheel', function(e) {
        checkCheat(e);
        if (e.ctrlKey)
            e.preventDefault();
    }, { passive: false });

    document.addEventListener('mousemove', onMouseMove, false);
    document.addEventListener('mousedown', onMouseDown, false);

    document.addEventListener('touchstart', function(e) {
        if (e.touches.length === 1) {
            onMouseDown(e.touches[0]);
        }
    });

    document.addEventListener('touchmove', function(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            onMouseMove(e.touches[0]);
        } else if (e.touches.length === 3) {

            let y = e.touches[0].clientY;
            if (y > 3 + MOUSE.deltaY) {
                e.touches[0].deltaY = -1;
                checkCheat(e.touches[0]);
            }

            MOUSE.deltaY = y;
        }

    }, { passive: false });

    document.addEventListener('mouseup', onMouseUp, false);
    document.addEventListener('touchend', function(e) {
        e.preventDefault();
        if (e.touches.length === 0) {
            onMouseUp(e);

            MOUSE.reset = true;
            BRUTEFORCE.clientX = undefined;
        };
    }, false);

    window.addEventListener('contextmenu', function(e) {
        // disable right click
        e.preventDefault();
    });

    window.addEventListener('keydown', function(e) {
        KEYBOARD.down(e);
    });

    window.addEventListener('keyup', function(e) {
        KEYBOARD.up(e);
    });

    document.body.addEventListener('mouseleave', function(e) {
        KEYBOARD.reset();
        MOUSE.reset = true;
    });

    LEVELS.clear();
    loadLevel(1, false);

    initAudio();

    update();
}

function setupScene() {
    DOM.width = DOM.container.offsetWidth;
    DOM.height = DOM.container.offsetHeight;

    WORLD.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });

    WORLD.renderer.setPixelRatio(2 || window.devicePixelRatio);
    WORLD.renderer.setSize(DOM.width, DOM.height);

    DOM.container.appendChild(WORLD.renderer.domElement);

    CAMERA = new THREE.__ObliqueCamera(DOM.width / DOM.height, 1 * 3.2 / 11 /*3 / 11*/ , WORLD_INFO.depthFactor * 3, 0.092);
    CAMERA.rotation.x = -Math.PI / 2;
    // CAMERA.position.x = 0;
    // CAMERA.position.z = 0;
    // CAMERA.position.y = 1.5;

    CAMERA.resize(DOM.width, DOM.height, true);

    WORLD.scene = new THREE.Scene();
    WORLD.scene.background = new THREE.Color(0); //0xaaaaaa

    if (WORLD.renderer.extensions.get('ANGLE_instanced_arrays') === null) {
        document.body.appendChild(WEBGL_.getErrorMessage(undefined, 3));
        return;
    }

    CUBE.geometry = new THREE.InstancedBufferGeometry();


    //LAYOUT:
    //vertexBuffer: vertex x, vertex y, vertex z, uvX, uvY
    //CUBE._col, CUBE.col, startPosX, startPosY, startPosZ, targPosX, targPosY, targPosZ, CUBE._time, CUBE.speed;
    var vertexBuffer = new THREE.InterleavedBuffer(new Float32Array([
            // Top
            -.5, .5, .5, 0, .5,
            .5, .5, .5, .5, .5,
            -.5, .5, -.5, 0, 1,
            .5, .5, -.5, .5, 1,
            // Right
            .5, .5, -.5, .5, 1,
            .5, .5, .5, .5, .5,
            .5, -.5, -.5, 1, 1,
            .5, -.5, .5, 1, .5,

            //left
            // -.5, .5, -.5, .5, 1,
            // -.5, .5, .5, .5, .5,
            // -.5, -.5, -.5, 1, 1,
            // -.5, -.5, .5, 1, .5,

            // Front
            .5, .5, .5, .5, .5,
            -.5, .5, .5, 0, .5,
            .5, -.5, .5, .5, 0,
            -.5, -.5, .5, 0, 0,
        ]), 5),
        vertexPos = new THREE.InterleavedBufferAttribute(vertexBuffer, 3, 0),
        uvs = new THREE.InterleavedBufferAttribute(vertexBuffer, 2, 3),
        indices = new Uint8Array([ //Uint16Array ?
            0, 1, 2,
            2, 1, 3,
            4, 5, 6,
            6, 5, 7,

            // 5, 4, 6,
            // 5, 6, 7,
            8, 9, 10,
            10, 9, 11
        ]);

    // per instance data

    CUBE.instanceBuffer = new THREE.InstancedInterleavedBuffer(new Float32Array(CUBE.maxInstances * 10), 10, 1).setDynamic(true);

    CUBE._col = new THREE.InterleavedBufferAttribute(CUBE.instanceBuffer, 1, 0);
    CUBE.col = new THREE.InterleavedBufferAttribute(CUBE.instanceBuffer, 1, 1);
    CUBE._pos = new THREE.InterleavedBufferAttribute(CUBE.instanceBuffer, 3, 2);
    CUBE.pos = new THREE.InterleavedBufferAttribute(CUBE.instanceBuffer, 3, 5);
    CUBE._time = new THREE.InterleavedBufferAttribute(CUBE.instanceBuffer, 1, 8);
    CUBE.speed = new THREE.InterleavedBufferAttribute(CUBE.instanceBuffer, 1, 9);

    CUBE.geometry.addAttribute('vertexPos', vertexPos);
    CUBE.geometry.addAttribute('uv', uvs);
    CUBE.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    //CUBE instance
    CUBE.geometry.addAttribute('_col', CUBE._col);
    CUBE.geometry.addAttribute('col', CUBE.col);
    CUBE.geometry.addAttribute('_pos', CUBE._pos);
    CUBE.geometry.addAttribute('pos', CUBE.pos); // per CUBE.mesh translation
    CUBE.geometry.addAttribute('_time', CUBE._time);
    CUBE.geometry.addAttribute('speed', CUBE.speed);
    CUBE.geometry.maxInstancedCount = 0;


    // material
    var texture = new THREE.TextureLoader().load('rsrc/tex/fac.png');
    texture.magFilter = THREE.NearestFilter;
    // texture.minFilter = THREE.NearestFilter;

    CLOCK.init();

    CUBE.material = new THREE.RawShaderMaterial({
        uniforms: {
            depthFactor: { value: WORLD_INFO.depthFactor },
            fogHeight: { value: CAMERA.fogHeight },
            map: { value: texture },
            currTime: { value: CLOCK.time },
            forces: { type: "fv", value: [0, 0, 0, 0, 0] },
        },
        vertexShader: document.getElementById('vertexShader').textContent,
        fragmentShader: document.getElementById('fragmentShader').textContent,
        transparent: false
    });

    CUBE.mesh = new THREE.Mesh(CUBE.geometry, CUBE.material);
    CUBE.mesh.frustumCulled = false;

    WORLD.scene.add(CUBE.mesh);

    if (DOM.debug) {
        WORLD.stats = new Stats();
        DOM.container.appendChild(WORLD.stats.dom);
    }
}

//CUBE FUNCTIONS

function instanceToWorldPos(instance) {
    let [x, y, z] = CUBE.pos.__getXYZ(instance); //get non interpolated position
    return [
        Math.round(x),
        Math.round(y),
        Math.round(z),
    ]
}

function worldPosToId(x, y, z) {
    //round y because buttons and goals dont have int y position
    // x = Math.round(x); //float32array has a lot of accurate range so can be omitted, and wouldnt work with int anyway
    y = Math.round(y);

    let chunkCoords = [
            Math.floor(x / WORLD_INFO.x),
            Math.floor(y / WORLD_INFO.y),
            Math.floor(z / WORLD_INFO.z)
        ],
        name = '' + chunkCoords;

    return [
        CHUNKS.get(name) /*|| CHUNKS.set('' + chunkCoords)*/ ,
        (x - (chunkCoords[0] * WORLD_INFO.x)) +
        (z - (chunkCoords[2] * WORLD_INFO.z)) * WORLD_INFO.x +
        (y - (chunkCoords[1] * WORLD_INFO.y)) * WORLD_INFO.x * WORLD_INFO.z,
        name
    ]
}

function chunkPosToId(x, y, z) {
    return x + z * WORLD_INFO.x + y * WORLD_INFO.x * WORLD_INFO.z;
}

function idToWorldPos(chunk, id) {
    let pos = idToChunkPos(id);
    return [
        pos[0] + chunk[0] * WORLD_INFO.x,
        pos[1] + chunk[1] * WORLD_INFO.y,
        pos[2] + chunk[2] * WORLD_INFO.z
    ]
}

function chunkPosToWorldPos(pos, chunk) {
    return [
        pos[0] + chunk[0] * WORLD_INFO.x,
        pos[1] + chunk[1] * WORLD_INFO.y,
        pos[2] + chunk[2] * WORLD_INFO.z
    ]
}

function idToChunkPos(id) {
    return [
        id % WORLD_INFO.x,
        ~~(id / (WORLD_INFO.x * WORLD_INFO.z)),
        ~~(id / WORLD_INFO.x) % WORLD_INFO.z
    ]
}

//CHUNK FUNCTIONS

function highlightCube(r) {

    if ((r === undefined && CUBE.current !== undefined) || (r !== undefined && CUBE.current !== undefined && (CUBE.current !== r))) {

        changeCube(CUBE.current, { move: [0, -0, 0], color: [255, 255, 255] });
        CUBE.current = undefined;
    }

    if (CUBE.current === undefined && r !== undefined) {
        CUBE.current = r;
        changeCube(CUBE.current, { move: [0, 0, 0], color: [60, 60, 60] });
    }
}

let test = new Map([
    [1, 2],
    [2, 2],
    [3, 2]
]);

function onMouseDown(e) {
    MOUSE.down(e);

    TRI_CLICK.down();
    AUDIO.click();

    MOVEMENT.needRecalc = true;
    MOVEMENT.wait = MOVEMENT.defWait;
}

function onMouseUp(e) {
    MOUSE.up(e);

    TRI_CLICK.up();
}

window.addEventListener('tripleclick', function(e) {

    if (e.detail.target === PLAYER) {
        reloadLevel();
    }
});

function onMouseMove(e) {
    MOUSE.move(e);
    // TRI_CLICK.move(e);

    MOUSE.needsUpdate = 1;

    // CAMERA.oblique = e.clientY/200;
    // CAMERA.updateProjectionMatrix();

    BRUTEFORCE.update(e.clientX, e.clientY, MOUSE.pressed);
    MOUSE.update(e);

    // CAMERA.zoom = e.clientX/DOM.width;
    // CAMERA.updateProjectionMatrix();
}

//CUBE FUNCTIONS 2

function onWindowResize() {

    DOM.width = DOM.container.offsetWidth;
    DOM.height = DOM.container.offsetHeight;

    WORLD.renderer.setSize(DOM.width, DOM.height);
    CAMERA.resize(DOM.width, DOM.height, true);

    WORLD_INFO.setChunkConst();
}




function update() {

    requestAnimationFrame(update);

    CLOCK.update();

    render();

    if (DOM.debug)
        WORLD.stats.update();

    KEYBOARD.update();
}

function render() {

    AUDIO.update();
    MOUSE.updateForces();
    CAMERA.updateEasing();
    TRI_CLICK.calls();

    CUBE.material.uniforms.fogHeight.value = CAMERA.ezFogHeight;
    CUBE.material.uniforms.currTime.value = CLOCK.time;
    CUBE.material.uniforms.forces.value = [MOUSE.ezPos3d.x, MOUSE.ezPos3d.z, MOUSE.force3d.x, MOUSE.force3d.y || 1e-9, MOUSE.force3d.z];
    CUBE.instanceBuffer.needsUpdate = true;

    // WORLD.interact = false;
    if (WORLD.interact) {
        blockInteraction();
        CHUNKS_.update(CAMERA.position.x, CAMERA.position.z);
    }

    if (WORLD.render)
        WORLD.renderer.render(WORLD.scene, CAMERA);
}

window.addEventListener('load', init);