import mimeMap from "./mimeMap.js";

// 扩展String原型以支持UTF-8编码
declare global {
  interface String {
    toUtf8Bytes(): number[];
    utf8CodeAt(i: number): number[];
  }
}

// 文件数据接口
interface FileData {
  name: string;
  buffer: ArrayBuffer;
  fileName: string;
}

// FormData返回结果接口
interface FormDataResult {
  contentType: string;
  buffer: ArrayBuffer;
}

class FormData {
  private fileManager: WechatMiniprogram.FileSystemManager;
  private data: Record<string, any> = {};
  private files: FileData[] = [];

  constructor() {
    this.fileManager = wx.getFileSystemManager();
  }

  append(name: string, value: any): boolean {
    this.data[name] = value;
    return true;
  }

  appendFile(name: string, path: string, fileName?: string): boolean {
    const buffer = this.fileManager.readFileSync(path) as ArrayBuffer;
    if (Object.prototype.toString.call(buffer).indexOf("ArrayBuffer") < 0) {
      return false;
    }

    if (!fileName) {
      fileName = getFileNameFromPath(path);
    }

    this.files.push({
      name: name,
      buffer: buffer,
      fileName: fileName,
    });
    return true;
  }

  getData(): FormDataResult {
    return convert(this.data, this.files);
  }
}

function getFileNameFromPath(path: string): string {
  const idx = path.lastIndexOf("/");
  return path.substr(idx + 1);
}

function convert(data: Record<string, any>, files: FileData[]): FormDataResult {
  const boundaryKey = "wxmpFormBoundary" + randString(); // 数据分割符，一般是随机的字符串
  const boundary = "--" + boundaryKey;
  const endBoundary = boundary + "--";

  let postArray: number[] = [];
  //拼接参数
  if (data && Object.prototype.toString.call(data) == "[object Object]") {
    for (const key in data) {
      postArray = postArray.concat(formDataArray(boundary, key, data[key]));
    }
  }
  //拼接文件
  if (files && Object.prototype.toString.call(files) == "[object Array]") {
    for (const i in files) {
      const file = files[i];
      postArray = postArray.concat(
        formDataArray(boundary, file.name, file.buffer, file.fileName)
      );
    }
  }
  //结尾
  const endBoundaryArray: number[] = [];
  endBoundaryArray.push(...endBoundary.toUtf8Bytes());
  postArray = postArray.concat(endBoundaryArray);
  return {
    contentType: "multipart/form-data; boundary=" + boundaryKey,
    buffer: new Uint8Array(postArray).buffer,
  };
}

function randString(): string {
  let result = "";
  const chars =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let i = 17; i > 0; --i)
    result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

function formDataArray(
  boundary: string,
  name: string,
  value: any,
  fileName?: string
): number[] {
  let dataString = "";
  const isFile = !!fileName;

  dataString += boundary + "\r\n";
  dataString += 'Content-Disposition: form-data; name="' + name + '"';
  if (isFile) {
    dataString += '; filename="' + fileName + '"' + "\r\n";
    dataString += "Content-Type: " + getFileMime(fileName!) + "\r\n\r\n";
  } else {
    dataString += "\r\n\r\n";
    dataString += value;
  }

  let dataArray: number[] = [];
  dataArray.push(...dataString.toUtf8Bytes());

  if (isFile) {
    const fileArray = new Uint8Array(value);
    dataArray = dataArray.concat(Array.prototype.slice.call(fileArray));
  }
  dataArray.push(..."\r".toUtf8Bytes());
  dataArray.push(..."\n".toUtf8Bytes());

  return dataArray;
}

function getFileMime(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  const extension = fileName.substr(idx);
  const mime = (mimeMap as any)[extension];
  return mime ? mime : "application/octet-stream";
}

// 扩展String原型方法
String.prototype.toUtf8Bytes = function (): number[] {
  const str = this;
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(...str.utf8CodeAt(i));
    if (str.codePointAt(i)! > 0xffff) {
      i++;
    }
  }
  return bytes;
};

String.prototype.utf8CodeAt = function (i: number): number[] {
  const str = this;
  const out: number[] = [];
  let p = 0;
  const c = str.charCodeAt(i);
  if (c < 128) {
    out[p++] = c;
  } else if (c < 2048) {
    out[p++] = (c >> 6) | 192;
    out[p++] = (c & 63) | 128;
  } else if (
    (c & 0xfc00) == 0xd800 &&
    i + 1 < str.length &&
    (str.charCodeAt(i + 1) & 0xfc00) == 0xdc00
  ) {
    // Surrogate Pair
    const combined =
      0x10000 + ((c & 0x03ff) << 10) + (str.charCodeAt(++i) & 0x03ff);
    out[p++] = (combined >> 18) | 240;
    out[p++] = ((combined >> 12) & 63) | 128;
    out[p++] = ((combined >> 6) & 63) | 128;
    out[p++] = (combined & 63) | 128;
  } else {
    out[p++] = (c >> 12) | 224;
    out[p++] = ((c >> 6) & 63) | 128;
    out[p++] = (c & 63) | 128;
  }
  return out;
};

export default FormData;
