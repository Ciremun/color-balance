'use strict';

const colors = {
    'shadows':    { 'r': 0, 'g': 0, 'b': 0 },
    'midtones':   { 'r': 0, 'g': 0, 'b': 0 },
    'highlights': { 'r': 0, 'g': 0, 'b': 0 }
};

let mode = 'midtones';

function rangeValueToPercent(value) {
    return (value / 255.0 * 100).toFixed(1);
}

function getLabels() {
    const r_label = document.getElementById('r_label');
    const g_label = document.getElementById('g_label');
    const b_label = document.getElementById('b_label');
    return [r_label, g_label, b_label];
}

/**
 * Get the range input elements
 * @returns {Array[HTMLInputElement]}
 */
function getRanges() {
    const r_range = document.getElementById('r');
    const g_range = document.getElementById('g');
    const b_range = document.getElementById('b');
    return [r_range, g_range, b_range];
}

function getRadioButtons() {
    const shadows = document.getElementById('shadows');
    const midtones = document.getElementById('midtones');
    const highlights = document.getElementById('highlights');
    return [shadows, midtones, highlights];
}

function setRanges() {
    const ranges = getRanges();
    const [r_range, g_range, b_range] = ranges;
    const [r_label, g_label, b_label] = getLabels();
    const rgb = colors[mode];
    if (rgb.r !== 0 || rgb.g !== 0 || rgb.b !== 0) {
        r_range.value = rgb.r;
        g_range.value = rgb.g;
        b_range.value = rgb.b;
        r_label.innerText = rangeValueToPercent(r_range.value);
        g_label.innerText = rangeValueToPercent(g_range.value);
        b_label.innerText = rangeValueToPercent(b_range.value);
        return;
    }
    for (const range of ranges) {
        range.value = 0;
    }
    r_label.innerText = '0.0';
    g_label.innerText = '0.0';
    b_label.innerText = '0.0';
}

/**
 * Convert range values to RGB color + white offset
 * @returns {Array[HTMLInputElement]}
 */
function getColor(value) {
    let f = parseFloat(value);
    if (f <= 0.0) {
        f = (255.0 + f) / 255.0 - 1.0;
    } else {
        f = 1.0 + ((f - 255.0) / 255.0);
    }
    return f;
}

/**
 * Fill the bound buffer with a rectanlle of specified size
 * @param {WebGL2RenderingContext} gl
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @returns {undefined}
 */
function setRectangle(gl, x, y, width, height) {
    const x1 = x;
    const x2 = x + width;
    const y1 = y;
    const y2 = y + height;
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        x1, y1,
        x2, y1,
        x1, y2,
        x1, y2,
        x2, y1,
        x2, y2,
    ]), gl.STATIC_DRAW);
}

/**
 * Create a shader program from source
 * @param {WebGL2RenderingContext} gl
 * @param {number} type shader type
 * @param {number} source shader source code
 * @returns {WebGLShader}
 */
function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    if (shader === null) {
        alert('shader compilation failed');
        return;
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (success) {
        return shader;
    }
    console.log(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
}

/**
 * Create a gl program from shaders
 * @param {WebGL2RenderingContext} gl
 * @param {WebGLShader} vertexShader
 * @param {WebGLShader} fragmentShader
 * @returns {WebGLProgram}
 */
function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    if (program === null) {
        alert('program creation failed');
    }
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (success) {
        return program;
    }
    console.log(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
}

/**
 * Render the image
 * @param {HTMLCanvasElement} canvas
 * @param {Image} image
 * @returns {undefined}
 */
function render(canvas, image) {
    canvas.width = image.width;
    canvas.height = image.height;

    const gl = canvas.getContext('webgl2');

    const vertexShaderSource = `#version 300 es
uniform vec2 u_resolution;

in vec2 a_texCoord;
in vec2 a_position;

out vec2 v_texCoord;

void main() {
    vec2 zeroToOne = a_position / u_resolution;
    vec2 zeroToTwo = zeroToOne * 2.0;
    vec2 clipSpace = zeroToTwo - 1.0;
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
    v_texCoord = a_texCoord;
}
`;
    const fragmentShaderSource = `#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform vec3 u_shadows;
uniform vec3 u_midtones;
uniform vec3 u_highlights;

in vec2 v_texCoord;

out vec4 outColor;

// https://stackoverflow.com/a/17773828
vec3 color_balance(vec3 textureColor)
{
    const float amount = 1.0;
    
    float intensity = (textureColor.r + textureColor.g + textureColor.b) * 0.333333333;  
    
    float shadows_bleed = 1.0 - intensity;
    shadows_bleed = shadows_bleed * shadows_bleed * shadows_bleed;
    
    float midtones_bleed = 1.0 - abs(-1.0 + intensity * 2.0);
    midtones_bleed = midtones_bleed * midtones_bleed * midtones_bleed;
    
    float highlights_bleed = intensity;
    highlights_bleed = highlights_bleed * highlights_bleed * highlights_bleed;
    
    vec3 colorization = textureColor.rgb + (u_shadows * shadows_bleed) + (u_midtones * midtones_bleed) + (u_highlights * highlights_bleed);   
    return mix(textureColor.rgb, colorization, amount);
}

void main() {
    lowp vec4 textureColor = texture(u_image, v_texCoord);
    textureColor.rgb = color_balance(textureColor.rgb);
    outColor = textureColor;
}
`;
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    if (vertexShader === undefined) {
        alert('vertex shader compilation failed');
    }
    if (fragmentShader === undefined) {
        alert('fragment shader compilation failed');
    }

    const program = createProgram(gl, vertexShader, fragmentShader);
    if (program === undefined) {
        alert('program creation failed');
    }

    const positionAttributeLocation = gl.getAttribLocation(program, 'a_position');
    const texCoordAttributeLocation = gl.getAttribLocation(program, 'a_texCoord');

    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
    const imageLocation = gl.getUniformLocation(program, 'u_image');
    const shadowsLocation = gl.getUniformLocation(program, 'u_shadows');
    const midtonesLocation = gl.getUniformLocation(program, 'u_midtones');
    const highlightsLocation = gl.getUniformLocation(program, 'u_highlights');

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const positionBuffer = gl.createBuffer();
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    const texCoordBuffer = gl.createBuffer();
    const rect = new Float32Array([
        0.0, 0.0,
        1.0, 0.0,
        0.0, 1.0,
        0.0, 1.0,
        1.0, 0.0,
        1.0, 1.0,
    ]);
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, rect, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(texCoordAttributeLocation);
    gl.vertexAttribPointer(texCoordAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + 0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(program);

    gl.bindVertexArray(vao);

    gl.uniform2f(resolutionLocation, gl.canvas.width, gl.canvas.height);
    gl.uniform1i(imageLocation, 0);

    const shadows = [colors.shadows.r, colors.shadows.g, colors.shadows.b].map(c => getColor(c));
    const midtones = [colors.midtones.r, colors.midtones.g, colors.midtones.b].map(c => getColor(c));
    const highlights = [colors.highlights.r, colors.highlights.g, colors.highlights.b].map(c => getColor(c));
    gl.uniform3f(shadowsLocation, ...shadows);
    gl.uniform3f(midtonesLocation, ...midtones);
    gl.uniform3f(highlightsLocation, ...highlights);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    setRectangle(gl, 0, 0, image.width, image.height);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

window.onload = () => {
    const canvas = document.getElementById('c');
    const gl = canvas.getContext('webgl2');
    if (gl === null) {
        alert('webgl2 is not supported');
    }

    let image = new Image();
    image.src = 'data:image/png;base64,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';
    image.onload = () => {
        render(canvas, image);
    }

    const [shadows, midtones, highlights] = getRadioButtons();
    shadows.addEventListener('change', () => {
        mode = 'shadows';
        setRanges();
    });
    midtones.addEventListener('change', () => {
        mode = 'midtones';
        setRanges();
    });
    highlights.addEventListener('change', () => {
        mode = 'highlights';
        setRanges();
    });

    const [r_range, g_range, b_range] = getRanges();
    r_range.addEventListener('input', () => {
        colors[mode].r = r_range.value;
        document.getElementById('r_label').innerText = rangeValueToPercent(r_range.value);
        render(canvas, image);
    });
    g_range.addEventListener('input', () => {
        colors[mode].g = g_range.value;
        document.getElementById('g_label').innerText = rangeValueToPercent(g_range.value);
        render(canvas, image);
    });
    b_range.addEventListener('input', () => {
        colors[mode].b = b_range.value;
        document.getElementById('b_label').innerText = rangeValueToPercent(b_range.value);
        render(canvas, image);
    });

    const file_input = document.getElementById('f');
    file_input.addEventListener('change', (e) => {
        if (!e.target.files.length)
            return;
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            image = new Image();
            image.src = e.target.result;
            image.onload = () => {
                render(canvas, image);
            };
            image.onerror = () => {
                file_input.value = '';
                alert('error loading image');
            };
        }
        reader.readAsDataURL(file);
    });

    const saveBlob = (blob, filename) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        document.body.appendChild(a);
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        a.click();
    };

    const dl = document.getElementById('dl');
    dl.addEventListener('click', () => {
        render(canvas, image);
        canvas.toBlob((blob) => {
            saveBlob(blob, `${canvas.width}x${canvas.height}.png`);
        });
    });
};
