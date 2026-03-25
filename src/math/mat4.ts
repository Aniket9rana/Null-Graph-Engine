export type mat4 = Float32Array;

export function create(): mat4 {
    const out = new Float32Array(16);
    out[0] = 1;
    out[5] = 1;
    out[10] = 1;
    out[15] = 1;
    return out;
}

export function perspective(out: mat4, fovy: number, aspect: number, near: number, far: number): mat4 {
    const f = 1.0 / Math.tan(fovy / 2);
    out[0] = f / aspect;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = f;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    const nf = 1 / (near - far);
    out[10] = far * nf;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[14] = far * near * nf;
    out[15] = 0;
    return out;
}

export function lookAt(out: mat4, eye: number[], center: number[], up: number[]): mat4 {
    const [eyex, eyey, eyez] = eye;
    const [centerx, centery, centerz] = center;
    const [upx, upy, upz] = up;

    let z0 = eyex - centerx;
    let z1 = eyey - centery;
    let z2 = eyez - centerz;
    let len = z0 * z0 + z1 * z1 + z2 * z2;
    if (len > 0) {
        len = 1 / Math.sqrt(len);
        z0 *= len;
        z1 *= len;
        z2 *= len;
    }

    let x0 = upy * z2 - upz * z1;
    let x1 = upz * z0 - upx * z2;
    let x2 = upx * z1 - upy * z0;
    len = x0 * x0 + x1 * x1 + x2 * x2;
    if (len > 0) {
        len = 1 / Math.sqrt(len);
        x0 *= len;
        x1 *= len;
        x2 *= len;
    }

    let y0 = z1 * x2 - z2 * x1;
    let y1 = z2 * x0 - z0 * x2;
    let y2 = z0 * x1 - z1 * x0;
    len = y0 * y0 + y1 * y1 + y2 * y2;
    if (len > 0) {
        len = 1 / Math.sqrt(len);
        y0 *= len;
        y1 *= len;
        y2 *= len;
    }

    out[0] = x0;
    out[1] = y0;
    out[2] = z0;
    out[3] = 0;
    out[4] = x1;
    out[5] = y1;
    out[6] = z1;
    out[7] = 0;
    out[8] = x2;
    out[9] = y2;
    out[10] = z2;
    out[11] = 0;
    out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
    out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
    out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
    out[15] = 1;

    return out;
}

export function multiply(out: mat4, a: mat4, b: mat4): mat4 {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    return out;
}

export function invert4x4(out: Float32Array, m: Float32Array): boolean {
  const m00=m[0],m01=m[1],m02=m[2],m03=m[3];
  const m10=m[4],m11=m[5],m12=m[6],m13=m[7];
  const m20=m[8],m21=m[9],m22=m[10],m23=m[11];
  const m30=m[12],m31=m[13],m32=m[14],m33=m[15];

  const b00=m00*m11-m01*m10, b01=m00*m12-m02*m10;
  const b02=m00*m13-m03*m10, b03=m01*m12-m02*m11;
  const b04=m01*m13-m03*m11, b05=m02*m13-m03*m12;
  const b06=m20*m31-m21*m30, b07=m20*m32-m22*m30;
  const b08=m20*m33-m23*m30, b09=m21*m32-m22*m31;
  const b10=m21*m33-m23*m31, b11=m22*m33-m23*m32;

  let det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
  if(Math.abs(det)<1e-8) return false;
  det=1.0/det;

  out[0]=(m11*b11-m12*b10+m13*b09)*det;
  out[1]=(m02*b10-m01*b11-m03*b09)*det;
  out[2]=(m31*b05-m32*b04+m33*b03)*det;
  out[3]=(m22*b04-m21*b05-m23*b03)*det;
  out[4]=(m12*b08-m10*b11-m13*b07)*det;
  out[5]=(m00*b11-m02*b08+m03*b07)*det;
  out[6]=(m32*b02-m30*b05-m33*b01)*det;
  out[7]=(m20*b05-m22*b02+m23*b01)*det;
  out[8]=(m10*b10-m11*b08+m13*b06)*det;
  out[9]=(m01*b08-m00*b10-m03*b06)*det;
  out[10]=(m30*b04-m31*b02+m33*b00)*det;
  out[11]=(m21*b02-m20*b04-m23*b00)*det;
  out[12]=(m11*b07-m10*b09-m12*b06)*det;
  out[13]=(m00*b09-m01*b07+m02*b06)*det;
  out[14]=(m31*b01-m30*b03-m32*b00)*det;
  out[15]=(m20*b03-m21*b01+m22*b00)*det;
  return true;
}
