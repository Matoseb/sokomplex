const AUDIO = {
    context: undefined,
    weakContext: undefined,
    nodes: {},
    sounds: {},
    buffers: {},
    streams: {},

    timings: new Map(),
    continues: new Map(),

    time: 0,
    ready: new Promise(_ => {}),
    allowed: new UTILS.DeferredPromise(),

    async init(bufferInfo) {
        this.context = new(window.AudioContext || window.webkitAudioContext)();

        this.context.resume().then(this.enable.bind(this));

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

        play: function(name, { delay = 0, volume = 1, rate = 1, loop = false }) {

            let gainNode = this.context.createGain();
            let source = this.context.createBufferSource();

            gainNode.gain.value = volume;

            source.buffer = this.buffers[name];
            source.playbackRate.value = rate;
            source.loop = loop;
            source.connect(gainNode).connect(this.nodes[this.sounds[name].type]);
            source.start(this.context.currentTime + delay);

            return [source, gainNode.gain];
        },

        async stream(name, { loop = true, action, volume, fadeIn }) {
            let source = this.streams[name].audio;
            source.loop = loop;
            source.volume = 0.001;
            source.onplay = async e => {
                await this.streams[name].loaded;
                this.enableWithClick.delete(e.target);
                this.linearRampToValueAtTime(e.target, 'volume', volume, this.context.currentTime + 2);
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
        this.context.resume();
        return this.methods.play.call(this, ...arguments);
    },

    stream: function(name, ...args) {
        this.context.resume();

        let n = this.methods.stream.call(this, ...arguments);
    },

    enableWithClick: new Map(),

    click() {
        for (let [c, v] of this.enableWithClick) {
            v.call();
        }
    },

    bufferPlay: function(name, { delay = 0, volume = 1, rate = 1 }) {
        let time = this.time + delay;
        let names = this.timings.get(time);

        if (!names)
            this.timings.set(time, names = {});

        let infos = names[name];
        if (infos) {
            ++infos[0];
            infos[1] += volume;
            infos[2] += rate;
        } else {
            names[name] = [1, volume, rate]; //how many, iterated volume, iterated rate => for average
        }

    },

    update() {
        this.time = this.context.currentTime;

        for (let [time, sounds] of this.timings) {
            if (time <= this.time) {
                //make sounds
                for (let name in sounds) {
                    let [amount, volumes, rates] = sounds[name];

                    let iterations = Math.ceil(amount / 10),
                        volume = Math.max(volume / (amount / 10), 2);

                    for (; iterations--;) {
                        this.play(name, {
                            delay: Math.random() * 0.1,
                            volume: volumes + UTILS.variate(.2),
                            rate: (rates / amout) + UTILS.variate(.4)
                        });
                    }
                }

                this.timings.delete(time);
            }
        }

        //remove continuous sound when timing is done
        for (let [instance, names] of this.continues) {
            for (let [name, props] of names) {
                if (props[2] <= this.time) {
                    props[0].disconnect();
                    names.delete(name);
                }
            }

            if (!names.size)
                this.continues.delete(instance);
        }
    },

    enable() {

        // if (this.allowed.state !== 'resolved' && this.context.state === 'running') {

        this.volume.linearRampToValueAtTime(0.001, this.context.currentTime);
        this.volume.linearRampToValueAtTime(1, this.context.currentTime + 2);

        this.allowed.resolve();

        for (let key in this.methods) {
            this[key] = this.methods[key];
        }
        // }
        // else {
        //     this.context.resume(this.enable.bind(this));
        // }
    },

    muteContinues() {
        //remove continuous sound when restarting level or new level
        for (let [instance, names] of this.continues) {
            for (let [name, props] of names) {
                this.continuous(instance, name, true, {
                    volume: [
                        [.25, 0]
                    ]
                });
            }
        }
    },

    playSave(instance, name, { delay = 0, volume = 1, rate = 1 }) {
        let contextTime = this.context.currentTime;
        let names = this.continues.get(instance);

        if (!names) {
            this.continues.set(instance, names = new Map());
        }

        let curr = names.get(name); //curr = [buffernode, gain, end, iterations]

        if (curr) {
            curr[0].playbackRate.cancelScheduledValues(contextTime);
            curr[1].cancelScheduledValues(contextTime);
            curr[0].playbackRate.value = rate;
            curr[1].value = volume;
            curr[3] = 0;
        } else {
            curr = this.play(name, { loop: false, delay: delay, volume: volume, rate: rate });
            curr[2] = curr[3] = 0;

            names.set(name, curr);
            overwrite = true;
        }

        curr[2] = contextTime + curr[0].buffer.duration * (1 / rate);
        curr[3]++;

    },

    continuous(instance, name, overwrite, { asnew = false, loop = true, delay = 0, volume = [], rate = [] }) {
        let contextTime = this.context.currentTime;
        let names = this.continues.get(instance);

        if (!names) {
            this.continues.set(instance, names = new Map());
        }

        let curr = names.get(name); //curr = [buffernode, gain, end, iterations]

        if (asnew && curr) {
            curr[0].loop = curr = false;
            names.delete(name);
        }

        if (curr) {
            if (overwrite) {
                rate && curr[0].playbackRate.cancelAndHoldAtTime(contextTime);
                volume && curr[1].cancelAndHoldAtTime(contextTime);
                // curr[0].playbackRate.linearRampToValueAtTime(curr[0].playbackRate.value, contextTime);
                // curr[1].linearRampToValueAtTime(curr[1].value, contextTime);
                curr[3] = 0;
            }
        } else {

            curr = this.play(name, { loop: loop, delay: delay, volume: 0, rate: 0 });
            curr[2] = curr[3] = 0;
            names.set(name, curr);
            overwrite = true;
        }

        let end = contextTime;

        curr[3]++;

        for (let [time, value] of rate) {
            let t = contextTime + time;
            end = Math.max(end, t);

            overwrite && curr[0].playbackRate.linearRampToValueAtTime(value, t);
        }

        for (let [time, value] of volume) {
            let t = contextTime + time;
            end = Math.max(end, t);

            overwrite && curr[1].linearRampToValueAtTime(value, t);
        }




        curr[2] = end; //set maximum time of node

    },
}

async function initAudio() {

    AUDIO.init({
        'backgroundMusic': { url: 'rsrc/audio/music/ambient_1.mp3', type: 'music', stream: true },
        'slide': { url: 'rsrc/audio/noise/slide_2.wav', type: 'noise' },
        'slidebox': { url: 'rsrc/audio/noise/slidebox_2.wav', type: 'noise' },
        'fall': { url: 'rsrc/audio/noise/fall_2.wav', type: 'noise' },
        'land': { url: 'rsrc/audio/noise/landing.wav', type: 'noise' },
        'success': { url: 'rsrc/audio/noise/success.wav', type: 'noise' },
        'goal_active': { url: 'rsrc/audio/noise/goal_active_2.wav', type: 'noise' },
    });

    await AUDIO.ready;
    console.log('audio ready!');

    AUDIO.stream('backgroundMusic', { loop: true, action: 'play', volume: .5, fadeIn: 2 });

    //overwrite, prolongate

    // }, { once: true });

    // window.addEventListener('mousedown', async function() {
    //     if (t) {
    //         AUDIO.continuous(1, 'goal_active', true, {
    //             loop: false,
    //             asnew: true,
    //             rate: [
    //                 [0, 1]
    //             ],
    //             volume: [
    //                 [0, 0.2],
    //                 [5, 0]
    //             ]
    //         });
    //     } else {
    //         AUDIO.continuous(1, 'goal_active', true, {
    //             loop: false,
    //             asnew: false,
    //             rate: [[0.2, 0.8]],
    //             volume: [
    //                 [0.1, 0],
    //             ]
    //         });
    //     }

    //     t = !t;

    // });
}