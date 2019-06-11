const AUDIO = {
    context: undefined,
    weakContext: undefined,
    nodes: {},
    sounds: {},
    buffers: {},
    streams: {},

    ready: new Promise(_ => {}),
    allowed: new UTILS.DeferredPromise(),

    async init(bufferInfo) {
        this.context = new(window.AudioContext || window.webkitAudioContext)();

        this.sounds = bufferInfo;

        //volume node
        this.mainVolume = this.context.createGain();

        this.volume = 0;

        this.weakContext = this.mainVolume;
        this.weakContext.connect(this.context.destination);

        this.ready = this.loadSounds(bufferInfo).then(loadedBuffers => {
            this.buffers = loadedBuffers;
        });
    },

    get volume() {
        return this.mainVolume.gain;
    },

    set volume(value) {
        this.mainVolume.gain.value = value;
    },

    async loadSounds(bufferInfo) {
        const promises = [],
            keys = Object.keys(bufferInfo),
            loadedBuffers = {};

        for (let i = keys.length; i--;) {

            let name = keys[i];
            let infos = bufferInfo[name];

            if (infos.stream) {
                this.streams[name] = UTILS.stream(infos.url, 'audio/mp3', 2);
                promises.unshift(Promise.resolve());

            } else {
                this.createAudioNode(infos.type, 'DynamicsCompressor');

                promises.unshift(
                    UTILS.readFile(infos.url, 'arraybuffer')
                    .then(data => new Promise((res, rej) => this.context.decodeAudioData(data, res, rej)))
                );
            }
        }

        await Promise.all(promises).then(values => {

            for (let i = values.length; i--;) {
                let infos = bufferInfo[keys[i]];
                if (values[i] !== undefined)
                    loadedBuffers[keys[i]] = values[i];
            }
        });

        return loadedBuffers;
    },

    createAudioNode(name, type, args) {
        !this.nodes[name] && (this.nodes[name] = this.context['create' + type](args)).connect(this.weakContext);
    },

    //methods that needs user input to work properly, are overwritten when user input
    methods: {
        play: function(name, { delay = 0, volume = 1, rate = 1 }) {

            let gainNode = this.context.createGain();
            let source = this.context.createBufferSource();

            gainNode.gain.value = volume;

            source.buffer = this.buffers[name];
            source.playbackRate.value = rate;
            source.loop = this.sounds[name].loop;
            source.connect(gainNode).connect(this.nodes[this.sounds[name].type]);
            source.start(this.context.currentTime + delay);

            return source;
        },

        async stream(name, { loop = true, action, volume, fadeIn }) {
            let source = this.streams[name].audio;
            source.loop = loop;
            source.volume = 0.00001;
            source.onplay = async e => {
                await this.streams[name].loaded;
                this.enableWithClick.delete(e.target);
                this.linearRampToValueAtTime(e.target, 'volume', 1, this.context.currentTime + 2);
            }
            source.play().catch(_ => {
                this.enableWithClick.set(source, this.stream.bind(this, ...arguments))
            });
        },
    },

    linearRampToValueAtTime(media, prop, newValue, time) {
        let _time = this.context.currentTime;
        let _value = media[prop];

        cancelAnimationFrame(media[prop + '_frame']);

        function loop() {
            if (this.context.currentTime >= time) {
                media[prop] = newValue;
            } else {
                media[prop] = UTILS.map(this.context.currentTime, _time, time, _value, newValue);
                media[prop + '_frame'] = requestAnimationFrame(loop.bind(this));
            }
        }

        media[prop + '_frame'] = requestAnimationFrame(loop.bind(this));
    },

    play: function(name, ...args) {
        this.context.resume().then(this.enable.bind(this));
        let n = this.methods.play.call(this, ...arguments);
    },

    stream: function(name, ...args) {
        this.context.resume().then(this.enable.bind(this));
        let n = this.methods.stream.call(this, ...arguments);
    },

    enableWithClick: new Map(),

    click() {
        for (let [c, v] of this.enableWithClick) {
            v.call();
        }
    },

    enable() {
        if (this.allowed.state !== 'resolved' && this.context.state === 'running') {

            this.volume.linearRampToValueAtTime(0.001, this.context.currentTime);
            this.volume.linearRampToValueAtTime(1, this.context.currentTime + 2);

            this.allowed.resolve();

            for (let key in this.methods) {
                this[key] = this.methods[key];
            }
        }
    },
}

async function initAudio() {

    AUDIO.init({
        'backgroundMusic': { url: 'rsrc/audio/music/ambient_1.mp3', type: 'music', stream: true },
        'slide': { url: 'rsrc/audio/noise/slidebox.wav', type: 'noise' },
        'success': { url: 'rsrc/audio/noise/success.wav', type: 'noise' },
        'activeGoal': { url: 'rsrc/audio/noise/goal_active.mp3', type: 'noise' },
    });

    await AUDIO.ready;
    console.log('audio ready!');


    AUDIO.stream('backgroundMusic', { loop: true, action: 'play', volume: .5, fadeIn: 2 });
    // AUDIO.nodes['noise'].gain.value = 0.3;

    window.addEventListener('mousedown', async function() {
        AUDIO.play('activeGoal', { delay: 0, volume: 1, rate: 1 });
    });

    window.addEventListener('touchstart', async function() {
        AUDIO.play('activeGoal', { delay: 0, volume: 1, rate: 1 });
    });
}