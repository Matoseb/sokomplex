'use strict';

const PUSHEDCUBES = new Map();
const CUBECALLBACKS = new Map();
const MOVEMENT = {
    needRecalc: false,
    defWait: 1.25,

    recalc(t) {

        this.p = CUBE.pos.__getXYZ(PLAYER);
        this.o = [this.p[0], 0, this.p[2]];
        this.t = t;

        this.distX = Math.abs(this.t[0] - this.p[0]);
        this.distZ = -Math.abs(this.t[2] - this.p[2]);
        this.error = this.distX + this.distZ;

        this.stepX = this.p[0] < this.t[0] ? 1 : -1;
        this.stepZ = this.p[2] < this.t[2] ? 1 : -1;

        this.moves = [
            [this.stepX, 0, 0],
            [0, 0, this.stepZ]
        ];

        this.needRecalc = false;
    },

    //https://stackoverflow.com/questions/8936183/bresenham-lines-w-o-diagonal-movement/28786538#28786538
    calcPlayerPath() {

        if (!MOUSE.pressed || PUSHEDCUBES.get(PLAYER))
            return;

        let playerPos = instanceToWorldPos(PLAYER);

        let t = [Math.round(MOUSE.player3d.x), 0, Math.round(MOUSE.player3d.z)],
            wayX; //1 if move on x, 0 on y

        if (this.needRecalc || this.t[0] !== t[0] || this.t[2] !== t[2])
            this.recalc(t);

        if (this.p[2] !== this.t[2] || this.p[0] !== this.t[0]) {
            if (2 * this.error - this.distZ > this.distX - 2 * this.error) {
                this.error += this.distZ;
                this.p[0] += this.stepX;
                wayX = 0;
            } else {
                this.error += this.distX;
                this.p[2] += this.stepZ;
                wayX = 1;
            }

            // this.wait = 1;
        }

        return wayX;
    },

    movePlayer(bruteforce) {

        if (PLAYER === undefined || !WORLD.interact || CAMERA.panningAmt)
            return;

        if (!CAMERA.lock) {
            CAMERA.pan();
            MOUSE.needsUpdate = true;
            let o = {};
            [o.x, , o.z] = CUBE.pos.__getXYZ(PLAYER);
            CAMERA.moveTo(o, true);
        }

        // bruteforce.keepAvg();

        // //shock movement
        // if (!bruteforce.locked) {
        //     bruteforce.lock();

        //     let move = bruteforce.move;
        //     console.log('BRUTE FORCE:', move);
        //     let hit1 = hit(PLAYER, bruteforce.move);
        //     //move if no obstacle
        //     if (!hit1.props) {
        //         let options = { nBlock: hit1, move: move, speed: 70 },
        //             push = PUSHEDCUBES.get(PLAYER);

        //         if (push && performance.now() - push.time < push.wait * .5) {
        //             console.log('reset');
        //             options.move = undefined; //prevent double move
        //         }

        //         MOVETYPES.pushBlock(PLAYER, options, undefined, move);

        //         this.needRecalc = true;
        //     }

        //     return;
        //     // this.needRecalc = true;
        // }

        // if (bruteforce.locked === 2) {
        //     if (!MOUSE.force3d.y) {
        //         BRUTEFORCE.listen();
        //         // this.needRecalc = true;
        //     }

        //     return;
        // }

        // console.log('hey');

        let wayX = this.calcPlayerPath();

        if (wayX !== undefined) {
            let move1 = this.moves[wayX],
                hit1 = hit(PLAYER, move1);

            //move if no obstacle
            if (!hit1.props) {

                let options = { nBlock: hit1, move: move1 };

                //check ground when diagonal, if none change cube movement direction
                //all gud
                if (Math.abs(this.p[2] - this.t[2]) > 1 && Math.abs(this.p[0] - this.t[0]) > 1 &&
                    !hit(PLAYER, [move1[0], -1, move1[2]]).props) {

                    let move2 = this.moves[1 - wayX],
                        hit2 = hit(PLAYER, move2);

                    //if no adjacent wall -> move
                    if (!hit2.props) {
                        options.nBlock = hit2;
                        options.move = move2;
                    }
                }

                MOVETYPES.pushBlock(PLAYER, options);

            }

            //obstacle in x this
            else if (this.p[2] === this.t[2] && !wayX) {
                this.pushBox(0, hit1, move1);
            }

            //obstacle in z this
            else if (this.p[0] === this.t[0] && wayX) {
                this.pushBox(2, hit1, move1);
            }
            //obstacle in diagonal this
            else {
                this.needRecalc = true;


                //check other side
                let way = wayX * 2,
                    move2 = this.moves[1 - wayX],
                    hit2 = hit(PLAYER, move2),
                    dist = Math.abs(this.p[way] - this.t[way]) > 1;

                if (hit1.props[1] === 2 && (hit2.props || dist)) {
                    this.pushBox(way, hit1, move1);
                } else if (!hit2.props) {
                    MOVETYPES.pushBlock(PLAYER, { nBlock: hit2, move: move2 });
                }


            }
        }
    },

    pushBox(axis, hit1, move1) {

        this.needRecalc = true;

        if (hit1.props[1] === 2) {

            let hit2 = hit(hit1.instance, move1);
            if (!hit2.props) {

                this.needRecalc = false;
                if (this.p[axis] !== this.t[axis] || Math.abs(this.o[axis] - this.p[axis]) <= 1) {

                    MOVETYPES.pushBlock(hit1.instance, { nBlock: hit2, move: move1 });
                    MOVETYPES.pushBlock(PLAYER, { nBlock: hit1, move: move1 });
                }
            }
        }
    }
}
const MOVETYPES = {

    1: function(instance, options, wait, props, forced) {

        let result = hit(instance, [0, -1, 0]);

        let attributes = this.move(instance, options, wait, undefined, forced);


        MOVEMENT.wait = 0.8;

        if (options.move) {
            if (options.move[1]) {

                if (options.move[1] < 0) {
                    AUDIO.continuous(instance, 'fall', false, {
                        rate: [
                            [0, 1],
                            [1.5, 0.35]
                        ],
                        volume: [
                            [0, 0],
                            [0.38, 0.6],
                            [1.5, 0]
                        ]
                    });
                }

                //up or down
                CAMERA.setFogHeight(attributes[6]);
            } else {
                AUDIO.play('slide', { volume: .2 + UTILS.variate(.1), rate: 1 + UTILS.variate(0.15) });
            }
            //if x z movement
            let result = hit(instance, [0, -1, 0]);
            if (result.props) {
                if (result.props[0] !== LEVELS.currLevel) {
                    LEVELS.exchangeBlock(instance, result.props[0], true);
                    switchLevel(result.props[0]);
                } else if (!result.props[0]) {
                    LEVELS.exchangeBlock(instance, result.props[0], true);
                }
            }
        }
    },

    2: function(instance, options, wait, props) {

        let callback;

        let behaviour = props[2];

        if (behaviour > 2) {

            if (behaviour === 3) {

                let currLevel = LEVELS.curr[props[0]];

                AUDIO.play('goal_disable', { volume: .1, rate: 1 });
                AUDIO.continuous(instance, 'goal_active', true, {
                    loop: false,
                    asnew: false,
                    volume: [
                        [0.2, 0]
                    ],
                    rate: [
                        [1, 0.5]
                    ],
                });

                if (currLevel.active-- === currLevel.goals && typeof currLevel.done === 'string') {
                    callback = this.switchOffButton(instance, currLevel.done);
                }

            } else if (behaviour === 4) {
                callback = this.switchOffButton(instance);


                AUDIO.play('button_disable', { volume: .1, rate: 1 });
                AUDIO.continuous(instance, 'button_active', true, {
                    loop: false,
                    asnew: false,
                    volume: [
                        [0.2, 0]
                    ],
                    rate: [
                        [1, 0.5]
                    ],
                });


            }

            props[2] = 2;
            Object.assign(options, BLOCKTYPE[2]);
        }

        let hit1 = hit(instance, [0, -1, 0]);
        this.move(instance, options, wait, callback);

        if (options.move) {
            //if x z movement
            let hit2 = hit(instance, [0, -1, 0]);
            if (hit2.props && hit1.props) {
                let newLevel = hit2.props[0];
                if (newLevel === hit1.props[0] && newLevel !== LEVELS.currLevel) {
                    // console.log('hey');
                    LEVELS.exchangeBlock(instance, newLevel);
                }
            }

            if (!options.move[1]) {
                AUDIO.play('slidebox', { volume: .12 + UTILS.variate(.01), rate: 1 + UTILS.variate(0.15) });
            } else if (options.move[1] < 0) {
                AUDIO.continuous(instance, 'fall', false, {
                    rate: [
                        [0, 1],
                        [1.5, 0.3]
                    ],
                    volume: [
                        [0, 0],
                        [0.35, 0.8],
                        [2, 0]
                    ]
                });
            }
        }

    },

    6: function(instance, options, wait, props) {
        AUDIO.play('slide', { volume: .2 + UTILS.variate(.1), rate: 1 + UTILS.variate(0.15) });
        this.move(instance, options, wait);
    },

    switchOffButton(instance, tag) {
        let { coord, index, instance: _instance } = hit(instance, [0, -1, 0]);
        return moveDoors.bind(this, INSTANCES.get(_instance)[0], tag || coord + '_' + index);
    },

    pushBlock(instance, options, wait = MOVEMENT.wait, forced) {
        let props = INSTANCES.get(instance);

        this.updateUpperBlock(instance, options.move, wait);
        this[props[1]] && this[props[1]](instance, options, wait, props, forced);
    },

    updateUpperBlock(instance, move, wait) {
        if (move && move[1] <= 0) {
            let hit1 = hit(instance, [0, 1, 0]);

            if (move[1] < 0)
                wait = 0;

            if (hit1.props && BLOCKTYPE[hit1.props[1] || 0].fall) {

                let speed = CUBE.speed.getX(instance);

                PUSHEDCUBES.set(hit1.instance, {
                    time: CLOCK.time,
                    wait: speed * wait,
                    maxWait: speed * MOVEMENT.wait,
                    speed: speed,
                    forced: undefined
                });
            }
        }
    },

    move(instance, options, wait, callback, forced) {
        let attributes = changeCube(instance, options);

        if (callback) {
            let arr;
            (arr = CUBECALLBACKS.get(instance)) || CUBECALLBACKS.set(instance, (arr = []));
            arr.push(callback);
        }

        PUSHEDCUBES.set(instance, {
            time: CLOCK.time,
            wait: attributes[9] * wait,
            maxWait: attributes[9] * MOVEMENT.wait,
            speed: attributes[9],
            forced: forced
        });
        return attributes;
    }
}

function blockInteraction() {

    //check ground
    for (let [instance, value] of PUSHEDCUBES) {
        let timeDiff = CLOCK.time - value.time;

        let instanceProps = INSTANCES.get(instance);

        if (timeDiff >= Math.min(value.wait, value.speed * MOVEMENT.wait)) {
            let pos = CUBE.pos.__getXYZ(instance),
                [chunk, index, coord] = worldPosToId(pos[0], pos[1] - 1, pos[2]),
                groundInstance = chunk && chunk.get(index),
                groundProps = INSTANCES.get(groundInstance),
                cb = CUBECALLBACKS.get(instance);

            if (value.forced) {

                let hit1 = hit(instance, value.forced);
                let _hit1 = {};

                while (hit1.props) {
                    _hit1 = hit1;
                    hit1 = hit(hit1.instance, value.forced);
                }

                if (_hit1.props && _hit1.props[1] === 2) {
                    MOVETYPES.pushBlock(_hit1.instance, { nBlock: hit1, move: value.forced });
                }

                value.forced = undefined;
            }

            //callback movements
            if (cb) {
                for (let i = cb.length; i--;) {
                    cb.pop().call();
                }
                CUBECALLBACKS.delete(instance);
            }

            //no ground
            if (groundInstance === undefined && BLOCKTYPE[instanceProps[1] || 0].fall) {

                let move = [0, -1, 0];

                if (pos[1] < -WORLD_INFO.depthFactor) {
                    if (instanceProps[1] === 1) {
                        reloadLevel();
                    }
                    move[1] = 0;
                } else {

                    let opts = { move: move, nBlock: { chunk: chunk, index: index }, speed: Math.max(CUBE.speed.getX(instance) * 0.93, WORLD_INFO.speed * 0.35 /*0.37*/ ) },
                        wait = .2;

                    MOVETYPES.pushBlock(instance, opts, wait);
                }
            }
            //push button
            else if (instanceProps[1] === 2 && groundProps[1] === 4) {
                AUDIO.continuous(instance, 'button_active', true, {
                    loop: false,
                    asnew: true,
                    rate: [
                        [0, 0.7],
                        [0.12, 1.1]
                    ],
                    volume: [
                        [0, 0.1],
                        [5, 0.1]
                    ]
                });


                instanceProps[2] = groundProps[1]; //change appearance
                PUSHEDCUBES.delete(instance);
                changeCube(instance, Object.assign({}, BLOCKTYPE[instanceProps[2]], { speed: 100 }));
                moveDoors(groundProps[0], coord + '_' + index);
            }

            //ground goal
            else if (instanceProps[1] === 2 && groundProps[1] === 3) {

                instanceProps[2] = groundProps[1];
                changeCube(instance, Object.assign({}, BLOCKTYPE[instanceProps[2]], { speed: 100 }));
                PUSHEDCUBES.delete(instance);

                activateGoal(instance, groundProps, 100);

                //wait for finish falling
            } else if (timeDiff >= value.maxWait) {

                //check for fall movement
                let sound, cont = AUDIO.continues.get(instance);
                if (cont && (sound = cont.get('fall'))) {

                    AUDIO.play('land', {
                        volume: Math.min(.03 + sound[3] * 0.03, 0.3),
                        rate: 1.1 + UTILS.variate(0.15)
                    });

                    AUDIO.continuous(instance, 'fall', true, {
                        volume: [
                            [0.1, 0]
                        ]
                    });
                }

                PUSHEDCUBES.delete(instance);
            }
        }
    }

    MOVEMENT.movePlayer(BRUTEFORCE);
}

function activateGoal(box, goalProps, speed) {
    let level = LEVELS.curr[goalProps[0]];
    level.active++;

    AUDIO.continuous(box, 'goal_active', true, {
        loop: false,
        asnew: true,
        rate: [
            [0, (level.active - level.goals) / level.goals * 0.5 + 1]
        ],
        volume: [
            [0, 0.15],
            [5, 0.15]
        ]
    });

    if (level.active === level.goals) {

        AUDIO.play('win', { delay: 0, volume: 0.4, rate: 1.2});

        //activate doors
        if (typeof level.done === "string") {
            moveDoors(goalProps[0], level.done);
        } else {
            WORLD.interact = false;
            PUSHEDCUBES.clear();

            setTimeout(_ => loadLevel(level.done), speed);
        }
    }
}

function moveDoors(level, buttonId) {

    let doors = LEVELS.curr[level].buttons.get(buttonId);

    for (let door of doors) {

        let props = INSTANCES.get(door),
            move1 = UTILS.unpackMoves(props[4][props[3]]),
            hit1 = hit(door, move1),
            hit2,
            hit3;

        //move if no obstacle
        if (!hit1.props) {
            props[3] = (props[3] + 1) % props[4].length;
        }
        //push player or box
        else if (
            (hit1.props[1] === 1 || hit1.props[1] === 2) &&
            !(hit2 = hit(hit1.instance, move1)).props
        ) {
            props[3] = (props[3] + 1) % props[4].length;
            MOVETYPES.pushBlock(hit1.instance, { nBlock: hit2, move: move1 });
        } else {
            continue;
        }

        MOVETYPES.pushBlock(door, { nBlock: hit1, move: move1 });
    }
}

function hit(instance, move) {
    let nPos = CUBE.pos.__getXYZ(instance),
        [nChunk, nIndex, nCoord] = worldPosToId(nPos[0] + move[0], nPos[1] + move[1], nPos[2] + move[2]),
        nInstance = nChunk && nChunk.get(nIndex),
        nProps = INSTANCES.get(nInstance);

    return { chunk: nChunk, coord: nCoord, index: nIndex, instance: nInstance, props: nProps };
}

function changeCube(instance, { color, delay = 0, move, nBlock, brightness = 0, offset, speed = WORLD_INFO.speed }) { //nBlock: chunk and instance of new position
    let attributes,
        [_col, col, sx, sy, sz, tx, ty, tz, _time, _speed] = attributes = CUBE.instanceBuffer.__passAttributes(instance),
        [sr, sg, sb] = UTILS.unpackColor(_col), //start position
        [tr, tg, tb] = UTILS.unpackColor(col), //target position
        ez = UTILS.easeOutQuad((CLOCK.time - _time) / _speed); //easing

    if (offset !== undefined) {
        if (!move) move = [0, 0, 0];
        move[1] += offset;
    }

    //_col
    attributes[0] = UTILS.packColor((tr - sr) * ez + sr, (tg - sg) * ez + sg, (tb - sb) * ez + sb);
    //col
    if (color !== undefined) {
        attributes[1] = color + (brightness && UTILS.packColor(brightness[0], brightness[1], brightness[2]));
    }
    //_pos
    attributes[2] += (tx - sx) * ez;
    attributes[3] += (ty - sy) * ez;
    attributes[4] += (tz - sz) * ez;

    if (move) {
        //remove old pointer
        if (nBlock) {
            let [chunk, posId] = worldPosToId(tx, ty, tz);
            // chunk && chunk.delete(posId);

            chunk && chunk.delete(posId)
            // console.log(chunk, posId, '!FUCK', tx, ty, tz);

            nBlock.chunk && nBlock.chunk.set(nBlock.index, instance);
        }

        //pos
        attributes[5] += move[0];
        attributes[6] = Math.round(attributes[6]) + move[1];
        attributes[7] += move[2];

    }

    //_time
    attributes[8] = CLOCK.time + delay;

    //_speed
    attributes[9] = speed;

    return attributes;
}