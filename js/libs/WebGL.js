/**
 * @author alteredq / http://alteredqualia.com/
 * @author mr.doob / http://mrdoob.com/
 */

var WEBGL_ = {

    isWebGLAvailable() {

        try {

            var canvas = document.createElement('canvas');
            return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));

        } catch (e) {

            return false;

        }

    },

    isWebGL2Available() {

        try {

            var canvas = document.createElement('canvas');
            return !!(window.WebGL2RenderingContext && canvas.getContext('webgl2'));

        } catch (e) {

            return false;

        }

    },

    getWebGLErrorMessage() {

        return this.getErrorMessage(1);

    },

    getWebGL2ErrorMessage() {

        return this.getErrorMessage(2);

    },

    getErrorMessage(version = 1, info = 1) {

        let names = {
            1: '𝖶𝖾𝖻𝖦𝖫',
            2: '𝖶𝖾𝖻𝖦𝖫 𝟤',
            3: '𝖶𝖾𝖻𝖦𝖫 𝖠𝖭𝖦𝖫𝖤_𝗂𝗇𝗌𝗍𝖺𝗇𝖼𝖾𝖽_𝖺𝗋𝗋𝖺𝗒𝗌'
        };

        let contexts = {
            1: window.WebGLRenderingContext,
            2: window.WebGL2RenderingContext
        };

        let message = '𝖸𝗈𝗎𝗋 $0 𝖽𝗈𝖾𝗌 𝗇𝗈𝗍 𝗌𝖾𝖾𝗆 𝗍𝗈 𝗌𝗎𝗉𝗉𝗈𝗋𝗍 $1';

        let element = document.createElement('div');
        element.id = 'webglmessage';
        // element.href = "http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation";

        if (contexts[version]) {

            message = message.replace('$0', '𝗀𝗋𝖺𝗉𝗁𝗂𝖼𝗌 𝖼𝖺𝗋𝖽');

        } else {

            message = message.replace('$0', '𝖻𝗋𝗈𝗐𝗌𝖾𝗋');

        }

        message = message.replace('$1', names[info]);
        element.textContent = message;
        element.offsetWidth;
        setTimeout(_ => element.style.opacity = 1);

        return element;

    }

}