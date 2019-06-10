'use strict';

const DBL_CLICK = {
    state: 0,
    moves: 0,
    compare: undefined,

    down(e) {
        this.moves = 0;
        this.state++;
        clearTimeout(this.timeOut);
        this.timeOut = setTimeout(_ => {
            // console.log('dbl click disabled');
            this.state = 0;
        }, 700);
    },

    move(e) {
        if (this.moves > 8) {
            clearTimeout(this.timeOut);
            this.state = 0;
        }
        this.moves++;
    },

    up(e, callback, compare = true) {
        clearTimeout(this.timeOut);
        if (this.state >= 2) {
            if (this.compare === compare) {
                this.state = 0;
                callback(e, compare);
            } else {
                this.state = 1;
                this.compare = compare;
            }
        } else {
            this.compare = compare;
        }
    }
}


const UTILS = {

    DeferredPromise: function() {
        let res, rej, p = new Promise(function(resolve, reject) {
            res = resolve;
            rej = reject;
        });

        p.state = 'pending';

        p.resolve = a => {
            p.state = 'resolved';
            res.call(a)
        }

        p.reject = a => {
            p.state = 'rejected';
            rej.call(a)
        }

        return p;
    },

    stream(url, type) {
        return new Promise(resolve => {
            let audio = new Audio(url);
            audio.type = type;
            audio.onloadeddata = function() {
                if (this.readyState > 3)
                    resolve(this);
            }
        });
    },

    readFile(url, type) {
        return new Promise(resolve => {
            let req = new XMLHttpRequest();
            req.open('GET', url, true);
            req.responseType = type;

            req.onload = function() {
                resolve(this.response);
            }
            req.send();
        });
    },

    // https://www.f-sp.com/entry/2017/04/07/002913
    smoothDamp(current, target, refVelocity, maxSpeed = 10, smoothTime = 0.2, deltaTime = CLOCK.deltaTime * .001) {
        let num = 2 / (smoothTime || 0.00001);
        let num2 = num * deltaTime;
        let num3 = 1 / (1 + num2 + 0.48 * num2 * num2 + 0.235 * num2 * num2 * num2);
        let num4 = current - target;
        let num5 = target;
        let num6 = maxSpeed * smoothTime;
        num4 = this.clamp(num4, -num6, num6);
        target = current - num4;
        let num7 = (refVelocity.value + num * num4) * deltaTime;
        refVelocity.value = (refVelocity.value - num * num7) * num3;
        let num8 = target + (num4 + num7) * num3;
        if (num5 - current > 0 === num8 > num5) {
            num8 = num5;
            refVelocity.value = (num8 - num5) / deltaTime;
        }
        return num8;
    },

    lerp(start, end, amt) {
        return (1 - amt) * start + amt * end;
    },

    easeOutQuad(t) { t = this.clamp(t, 0, 1); return t * (2 - t) },

    clamp(n, min, max) {
        // if (n < min) { return min } else if (n > max) { return max } else { return n }
        return Math.min(max, Math.max(min, n));
    },

    roundPos([x, y, z]) {
        return [Math.round(x), Math.round(y), Math.round(z)]
    },

    stringToArray(s) {
        let a = s.split(',');
        return [+a[0], +a[1], +a[2]];
    },

    packMoves(x, y, z) {
        let n = x + y * 2 + z * 3;
        if (n < 0)
            n += 7;
        return n;
    },

    unpackMoves(n) {
        if (n > 3)
            n -= 7;

        let z = ~~(n / 3),
            zf = z * 3,
            y = ~~((n - zf) / 2),
            x = ~~(n - zf - y * 2);

        return [x, y, z];
    },

    sq512: 512 * 512,

    packColor(r, g, b) {
        return ~~r + ~~g * 512 + ~~b * this.sq512;
    },

    unpackColor(f) {
        let b = ~~(f / this.sq512),
            bf = b * this.sq512,
            g = ~~((f - bf) / 512),
            r = ~~(f - bf - g * 512);
        return [r, g, b];
    },

    mod(a, n) {
        //(% operator is remainder) not true modulo
        // return a - (n * Math.floor(a / n));
        return (a % n + n) % n;
    },

    //ES6 Set
    shiftSet(set) {
        let result = set.values().next().value;
        set.delete(result);
        return result;
    },

    //ES6 Map
    getAndDelete(map, key) {
        let value = map.get(key);
        map.delete(key);
        return value;
    },

    map: function(n, a, b, c, d) {
        return (n - a) / (b - a) * (d - c) + c;
    },

    shiftMap(map) {
        let result = map.entries().next().value;
        if (result !== undefined) {
            map.delete(result[0]);
            return result[1];
        }
    },

    transferTypedArray(typedArray, length) {
        if (length <= typedArray.length)
            return typedArray.slice(0, length);

        var destView = new window[typedArray.constructor.name](new ArrayBuffer(length * typedArray.BYTES_PER_ELEMENT));
        destView.set(new window[typedArray.constructor.name](typedArray.buffer));
        return destView;
    },

    renameMap(map, oldKey, newKey) {
        map.set(newKey, map.get(oldKey));
        return map.delete(oldKey);
    },

    insertInOrder(array, value) {
        var low = 0,
            high = array.length;

        while (low < high) {
            var mid = low + high >>> 1;
            if (array[mid] < value) low = mid + 1;
            else high = mid;
        }
        array.splice(low, 0, value);
        return array;
    }
}

const BRUTEFORCE = {

    init(length = 30, average = 20) {

        this.length = length;
        this.avg = average;

        this.sum = this.avg * this.length;
        this.pos = Array(this.length).fill(this.avg);

        this.avgThresh = 4;
        this.angleThresh = 0.8;

        this.move = [0, 0, 0];

        this.locked = 1; //null = no move, 0 = ready to move, 

        this.maxSpeed = this.avg * 2;
    },

    calcWay(vx, vy, length) {

        let angle = Math.atan2(vx, vy) + Math.PI / 2,
            x = Math.pow(Math.cos(angle), 3),
            y = Math.pow(Math.sin(angle), 3);

        if (Math.abs(x) > 1 / (2 - this.angleThresh)) {
            this.move = [Math.sign(x), 0, 0];
            this.locked = 0;
        } else if (Math.abs(y) > 1 / (2 - this.angleThresh)) {
            this.move = [0, 0, Math.sign(y)];
            this.locked = 0;
        }
    },

    lock() { this.locked = 2; },
    listen() { this.locked = 1; },

    keepAvg() {
        this.pos.push(this.avg);
        this.sum += this.avg - this.pos.shift();
        this.avg = this.sum / this.length;
    },

    update(x, y, pressed) {

        if (this.clientX !== undefined) {

            let vx = this.clientX - x,
                vy = y - this.clientY,
                pos = Math.hypot(vx, vy);

            if (pressed && this.locked === 1 && pos > this.avg * this.avgThresh + this.maxSpeed / this.avgThresh) {
                this.calcWay(vx, vy);
                this.maxSpeed = pos;
                pos = (this.avg + pos) / 2;
            }

            this.pos.push(pos);
            this.sum += pos - this.pos.shift();
            this.avg = this.sum / this.length;
        }

        this.clientX = x;
        this.clientY = y;
    }
}

class WorkerPool {
    constructor(workerScript, callback, instances) {
        this.callback = callback;
        this.workers = [];
        this.curr = 0;
        this.ready = this.init(workerScript, instances || 2);
    }

    async init(workerScript, instances) {
        //create blob url for downloading worker script once from server
        this.url = URL.createObjectURL(await UTILS.readFile(workerScript, 'blob'));

        for (; instances--;) {
            let worker = new Worker(this.url);
            worker.onmessage = this.callback.bind(this);
            this.workers.push(worker);
        }

        console.log(this.workers.length + ' chunk workers loaded');
    }

    async postMessage(data) {
        await this.ready;
        this.workers[this.curr++ % this.workers.length].postMessage(data);
    }

    async terminate(number) {
        await this.ready;

        if (number === undefined || number > this.workers.length)
            number = this.workers.length;

        for (; number--;) {
            this.workers.pop().terminate();
        }
    }
}