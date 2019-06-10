'use strict';

//MONKEY PATCHING

//based on shift method of Array

// //Typed Array:
// //clone typed array with diffferent length
// Object.defineProperty(Object.getPrototypeOf(Float32Array).prototype, '__resize', {
//     value: function(length) {
//         if (length <= this.length)
//             return this.slice(0, length);

//         var destView = new window[this.constructor.name](new ArrayBuffer(length * this.BYTES_PER_ELEMENT));
//         destView.set(new window[this.constructor.name](this.buffer));
//         return destView;
//     }
// });

//InterleavedBuffer

// return (n + (n>0?0.5:-0.5)) << 0;

// function roundShit(n) {
//     return n + ((n > 0) - 0.5) << 0;
// }

THREE.InstancedInterleavedBuffer.prototype.__passAttributes = function(a) {
    a *= this.stride;
    return this.array.subarray(a, a + this.stride);
}

THREE.InterleavedBufferAttribute.prototype.__getXYZ = function(a) {
    a = a * this.data.stride + this.offset;
    return this.data.array.slice(a, a + 3);
}

//Oblique Camera, based on https://jsfiddle.net/6xew0hn4/
THREE.__ObliqueCamera = function(aspect, oblique, far = 1000, zoom = 0.01) {
    THREE.Camera.call(this);
    this.type = 'ObliqueCamera';

    this.fogHeight = this.ezFogHeight = 2;
    this.lock = true;
    this.fogOffset = 1;
    this.fogSpeed = 0;
    this.fogVel = {value: 0};

    this.panning = true;

    this.panningAmt = 0;
    this.smoothTime = 0;

    this.tPosition = Object.assign({ vx: { value: 0 }, vz: { value: 0 } }, this.position);
    // this.isOrthographicCamera = true;

    this.absZoom = zoom;
    this.zoom = zoom;
    this.oblique = oblique;
    this.aspect = aspect;
    this.far = far;
    this.updateProjectionMatrix();
}

THREE.__ObliqueCamera.prototype = Object.create(THREE.Camera.prototype);
THREE.__ObliqueCamera.prototype.constructor = THREE.__ObliqueCamera;

THREE.__ObliqueCamera.prototype.setFogHeight = function(height, noLerp) {
    this.fogHeight = Math.max(height + this.fogOffset, 0);
    this.fogSpeed = 0;

    if (noLerp)
        this.ezFogHeight = this.fogHeight;
}

THREE.__ObliqueCamera.prototype.resize = function(width, height, proportionalZoom) {
    this.viewWidth = width;
    this.viewHeight = height;
    this.aspect = width / height;

    if (proportionalZoom)
        this.proportionalZoom();
}

THREE.__ObliqueCamera.prototype.moveTo = function(newPos, smooth) {
    Object.assign(this.tPosition, newPos);

    if (!smooth) {
        Object.assign(this.position, this.tPosition);
        this.tPosition.vx.value = this.tPosition.vz.value = 0;
    }
}

THREE.__ObliqueCamera.prototype.proportionalZoom = function(value = 0) {
    this.zoom = (this.absZoom += value);

    if (this.aspect > 1)
        this.zoom /= this.aspect;

    this.updateProjectionMatrix();
}

THREE.__ObliqueCamera.prototype.pan = function() {
    this.panningAmt = Infinity;
    this.smoothTime = 0.35;
    this.panning = true;
}

THREE.__ObliqueCamera.prototype.updateEasing = function() {

    //faster panning
    if (this.panning && ((this.position.x - this.tPosition.x) ** 2 + (this.position.z - this.tPosition.z) ** 2) < 2) {
        this.smoothTime = this.panningAmt = this.panning = 0;
        // console.log('done panning');
    }

    //position
    this.position.x = UTILS.smoothDamp(this.position.x, this.tPosition.x, this.tPosition.vx, this.panningAmt || 10, this.smoothTime || 0.2);
    this.position.z = UTILS.smoothDamp(this.position.z, this.tPosition.z, this.tPosition.vz, this.panningAmt || 10, this.smoothTime || 0.2);

    //fog
    // this.fogSpeed = (1 - 0.05) * this.fogSpeed + 0.05 * /*max amout*/ 0.05; //lerp acceleration
    // this.ezFogHeight = (1 - this.fogSpeed) * this.ezFogHeight + this.fogSpeed * this.fogHeight;
    this.ezFogHeight = UTILS.smoothDamp(this.ezFogHeight, this.fogHeight, this.fogVel, Infinity,0.5)
}

THREE.__ObliqueCamera.prototype.updateProjectionMatrix = function() {

    var offset = this.oblique * this.position.y,
        far = this.zoom * this.far;

    this.projectionMatrix.set(
        1, 0, -this.oblique, -offset,
        0, this.aspect, this.oblique * this.aspect, offset * this.aspect,
        0, 0, -1 / far, 0,
        0, 0, 0, 1 / this.zoom
    );
}