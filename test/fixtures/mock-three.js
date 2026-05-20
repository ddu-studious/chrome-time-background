'use strict';

/**
 * 轻量 Three.js mock，供 Node 单测验证 InstancedMesh 更新契约。
 * 不模拟真实 WebGL，仅记录 setMatrixAt / setColorAt / render 调用。
 */
function createMockThree() {
    class Color {
        constructor(hex) {
            this.hex = hex;
        }
        setHex(hex) {
            this.hex = hex;
            return this;
        }
    }

    class Matrix4 {
        constructor() {
            this.elements = new Float32Array(16);
            this.elements[0] = 1;
            this.elements[5] = 1;
            this.elements[10] = 1;
            this.elements[15] = 1;
        }
        makeTranslation(x, y, z) {
            this.elements[12] = x;
            this.elements[13] = y;
            this.elements[14] = z;
            return this;
        }
        identity() {
            this.elements.fill(0);
            this.elements[0] = 1;
            this.elements[5] = 1;
            this.elements[10] = 1;
            this.elements[15] = 1;
            return this;
        }
        makeScale(x, y, z) {
            this.elements[0] = x;
            this.elements[5] = y;
            this.elements[10] = z;
            return this;
        }
    }

    class BoxGeometry {
        constructor(w, h, d) {
            this.params = { w, h, d };
        }
        dispose() {}
    }

    class MeshStandardMaterial {
        constructor(opts) {
            this.opts = opts;
        }
        dispose() {}
    }

    class InstancedMesh {
        constructor(geometry, material, count) {
            this.geometry = geometry;
            this.material = material;
            this.count = count;
            this.instanceMatrix = { needsUpdate: false };
            this.instanceColor = { needsUpdate: false };
            this.matrices = [];
            this.colors = [];
        }
        setMatrixAt(index, matrix) {
            this.matrices[index] = Array.from(matrix.elements);
        }
        setColorAt(index, color) {
            this.colors[index] = color.hex;
        }
        dispose() {}
    }

    class PerspectiveCamera {
        constructor(fov, aspect, near, far) {
            this.fov = fov;
            this.aspect = aspect;
            this.near = near;
            this.far = far;
            this.position = { set: () => {} };
        }
        lookAt() {}
        updateProjectionMatrix() {}
    }

    class Scene {
        constructor() {
            this.children = [];
        }
        add(obj) {
            this.children.push(obj);
        }
    }

    class AmbientLight {
        constructor() {}
    }

    class DirectionalLight {
        constructor() {
            this.position = { set: () => {} };
        }
    }

    class WebGLRenderer {
        constructor(opts) {
            this.opts = opts || {};
            this.domElement =
                opts && opts.canvas
                    ? opts.canvas
                    : { style: {}, width: 0, height: 0 };
            this.renderCalls = 0;
            this.disposed = false;
        }
        setSize(w, h) {
            this.domElement.width = w;
            this.domElement.height = h;
        }
        setPixelRatio() {}
        setClearColor() {}
        render() {
            this.renderCalls += 1;
        }
        dispose() {
            this.disposed = true;
        }
    }

    return {
        Matrix4,
        Color,
        BoxGeometry,
        MeshStandardMaterial,
        InstancedMesh,
        PerspectiveCamera,
        Scene,
        AmbientLight,
        DirectionalLight,
        WebGLRenderer,
        PCFSoftShadowMap: 2,
        SRGBColorSpace: 'srgb'
    };
}

module.exports = { createMockThree };
