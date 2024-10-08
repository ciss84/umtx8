function die(msg) {
    throw new Error("PSFree failed: " + msg + "\nReload the page and try again.");
}
function debug_log(msg) {
    print(msg);
}
function clear_log() {
    // document.body.innerHTML = null;
}
function str2array(str, length, offset) {
    if (offset === undefined) {
        offset = 0;
    }
    let a = new Array(length);
    for (let i = 0; i < length; i++) {
        a[i] = str.charCodeAt(i + offset);
    }
    return a;
}
function align(a, alignment) {
    if (!(a instanceof Int)) {
        a = new Int(a);
    }
    const mask = -alignment & 0xffffffff;
    let type = a.constructor;
    let low = a.low() & mask;
    return new type(low, a.high());
}
async function send(url, buffer, file_name, onload = () => { }) {
    const file = new File(
        [buffer],
        file_name,
        { type: 'application/octet-stream' }
    );
    const form = new FormData();
    form.append('upload', file);

    debug_log('send');
    const response = await fetch(url, { method: 'POST', body: form });

    if (!response.ok) {
        throw Error(`Network response was not OK, status: ${response.status}`);
    }
    onload();
}
const KB = 1024;
const MB = KB * KB;
const GB = KB * KB * KB;
function check_range(x) {
    return (-0x80000000 <= x) && (x <= 0xffffffff);
}
function unhexlify(hexstr) {
    if (hexstr.substring(0, 2) === "0x") {
        hexstr = hexstr.substring(2);
    }
    if (hexstr.length % 2 === 1) {
        hexstr = '0' + hexstr;
    }
    if (hexstr.length % 2 === 1) {
        throw TypeError("Invalid hex string");
    }
    let bytes = new Uint8Array(hexstr.length / 2);
    for (let i = 0; i < hexstr.length; i += 2) {
        let new_i = hexstr.length - 2 - i;
        let substr = hexstr.slice(new_i, new_i + 2);
        bytes[i / 2] = parseInt(substr, 16);
    }
    return bytes;
}
function operation(f, nargs) {
    return function () {
        if (arguments.length !== nargs)
            throw Error("Not enough arguments for function " + f.name);
        let new_args = [];
        for (let i = 0; i < arguments.length; i++) {
            if (!(arguments[i] instanceof Int)) {
                new_args[i] = new Int(arguments[i]);
            } else {
                new_args[i] = arguments[i];
            }
        }
        return f.apply(this, new_args);
    };
}
class Int {
    constructor(low, high) {
        let buffer = new Uint32Array(2);
        let bytes = new Uint8Array(buffer.buffer);

        if (arguments.length > 2) {
            throw TypeError('Int takes at most 2 args');
        }
        if (arguments.length === 0) {
            throw TypeError('Int takes at min 1 args');
        }
        let is_one = false;
        if (arguments.length === 1) {
            is_one = true;
        }
        if (!is_one) {
            if (typeof (low) !== 'number'
                && typeof (high) !== 'number') {
                throw TypeError('low/high must be numbers');
            }
        }
        if (typeof low === 'number') {
            if (!check_range(low)) {
                throw TypeError('low not a valid value: ' + low);
            }
            if (is_one) {
                high = 0;
                if (low < 0) {
                    high = -1;
                }
            } else {
                if (!check_range(high)) {
                    throw TypeError('high not a valid value: ' + high);
                }
            }
            buffer[0] = low;
            buffer[1] = high;
        } else if (typeof low === 'string') {
            bytes.set(unhexlify(low));
        } else if (typeof low === 'object') {
            if (low instanceof Int) {
                bytes.set(low.bytes);
            } else {
                if (low.length !== 8)
                    throw TypeError("Array must have exactly 8 elements.");
                bytes.set(low);
            }
        } else {
            throw TypeError('Int does not support your object for conversion');
        }
        this.buffer = buffer;
        this.bytes = bytes;
        this.eq = operation(function eq(b) {
            const a = this;
            return a.low() === b.low() && a.high() === b.high();
        }, 1);
        this.neg = operation(function neg() {
            let type = this.constructor;

            let low = ~this.low();
            let high = ~this.high();

            let res = (new Int(low, high)).add(1);

            return new type(res);
        }, 0);
        this.add = operation(function add(b) {
            let type = this.constructor;

            let low = this.low();
            let high = this.high();

            low += b.low();
            let carry = 0;
            if (low > 0xffffffff) {
                carry = 1;
            }
            high += carry + b.high();

            low &= 0xffffffff;
            high &= 0xffffffff;

            return new type(low, high);
        }, 1);
        this.sub = operation(function sub(b) {
            let type = this.constructor;

            b = b.neg();

            let low = this.low();
            let high = this.high();

            low += b.low();
            let carry = 0;
            if (low > 0xffffffff) {
                carry = 1;
            }
            high += carry + b.high();

            low &= 0xffffffff;
            high &= 0xffffffff;

            return new type(low, high);
        }, 1);
    }
    low() {
        return this.buffer[0];
    }
    high() {
        return this.buffer[1];
    }
    toString(is_pretty) {
        if (!is_pretty) {
            let low = this.low().toString(16).padStart(8, '0');
            let high = this.high().toString(16).padStart(8, '0');
            return '0x' + high + low;
        }
        let high = this.high().toString(16).padStart(8, '0');
        high = high.substring(0, 4) + '_' + high.substring(4);
        let low = this.low().toString(16).padStart(8, '0');
        low = low.substring(0, 4) + '_' + low.substring(4);
        return '0x' + high + '_' + low;
    }
}
Int.Zero = new Int(0);
Int.One = new Int(1);
let mem = null;
function init_module(memory) {
    mem = memory;
}
class Addr extends Int {
    read8(offset) {
        const addr = this.add(offset);
        return mem.read8(addr);
    }
    read16(offset) {
        const addr = this.add(offset);
        return mem.read16(addr);
    }
    read32(offset) {
        const addr = this.add(offset);
        return mem.read32(addr);
    }
    read64(offset) {
        const addr = this.add(offset);
        return mem.read64(addr);
    }
    readp(offset) {
        const addr = this.add(offset);
        return mem.readp(addr);
    }
    write8(offset, value) {
        const addr = this.add(offset);

        mem.write8(addr, value);
    }
    write16(offset, value) {
        const addr = this.add(offset);

        mem.write16(addr, value);
    }
    write32(offset, value) {
        const addr = this.add(offset);

        mem.write32(addr, value);
    }
    write64(offset, value) {
        const addr = this.add(offset);

        mem.write64(addr, value);
    }
}
class MemoryBase {
    _addrof(obj) {
        if (typeof obj !== 'object'
            && typeof obj !== 'function'
        ) {
            throw TypeError('addrof argument not a JS object');
        }
        this.worker.a = obj;
        write64(this.main, view_m_vector, this.butterfly.sub(0x10));
        let res = read64(this.worker, 0);
        write64(this.main, view_m_vector, this._current_addr);
        return res;
    }
    addrof(obj) {
        return new Addr(this._addrof(obj));
    }
    set_addr(addr) {
        if (!(addr instanceof Int)) {
            throw TypeError('addr must be an Int');
        }
        this._current_addr = addr;
        write64(this.main, view_m_vector, this._current_addr);
    }
    get_addr() {
        return this._current_addr;
    }
    write0(size, offset, value) {
        const i = offset + 1;
        if (i >= 2 ** 32 || i < 0) {
            throw RangeError(`read0() invalid offset: ${offset}`);
        }
        this.set_addr(new Int(-1));
        switch (size) {
            case 8: {
                this.worker[i] = value;
            }
            case 16: {
                write16(this.worker, i, value);
            }
            case 32: {
                write32(this.worker, i, value);
            }
            case 64: {
                write64(this.worker, i, value);
            }
            default: {
                throw RangeError(`write0() invalid size: ${size}`);
            }
        }
    }
    read8(addr) {
        this.set_addr(addr);
        return this.worker[0];
    }
    read16(addr) {
        this.set_addr(addr);
        return read16(this.worker, 0);
    }
    read32(addr) {
        this.set_addr(addr);
        return read32(this.worker, 0);
    }
    read64(addr) {
        this.set_addr(addr);
        return read64(this.worker, 0);
    }
    readp(addr) {
        return new Addr(this.read64(addr));
    }
    write8(addr, value) {
        this.set_addr(addr);
        this.worker[0] = value;
    }
    write16(addr, value) {
        this.set_addr(addr);
        write16(this.worker, 0, value);
    }
    write32(addr, value) {
        this.set_addr(addr);
        write32(this.worker, 0, value);
    }
    write64(addr, value) {
        this.set_addr(addr);
        write64(this.worker, 0, value);
    }
}
class Memory extends MemoryBase {
    constructor(main, worker) {
        super();
        this.main = main;
        this.worker = worker;
        worker.a = 0;
        this.butterfly = read64(main, js_butterfly);
        write32(main, view_m_length, 0xffffffff);
        this._current_addr = Int.Zero;
        init_module(this);
    }
}
function make_buffer(addr, size) {
    const u = new Uint8Array(1001);
    const u_addr = mem.addrof(u);
    const old_addr = u_addr.read64(view_m_vector);
    const old_size = u_addr.read32(view_m_length);
    u_addr.write64(view_m_vector, addr);
    u_addr.write32(view_m_length, size);
    const copy = new Uint8Array(u.length);
    copy.set(u);
    const res = copy.buffer;
    u_addr.write64(view_m_vector, old_addr);
    u_addr.write32(view_m_length, old_size);
    return res;
}
function check_magic_at(p, is_text) {
    const text_magic = [
        new Int([0x55, 0x48, 0x89, 0xe5, 0x41, 0x57, 0x41, 0x56]),
        new Int([0x41, 0x55, 0x41, 0x54, 0x53, 0x50, 0x48, 0x8d]),
    ];
    const data_magic = [
        new Int(0x20),
        new Int(0x3c13f4bf, 0x2),
    ];
    const magic = is_text ? text_magic : data_magic;
    const value = [p.read64(0), p.read64(8)];
    return value[0].eq(magic[0]) && value[1].eq(magic[1]);
}
function find_base(addr, is_text, is_back) {
    const page_size = 16 * KB;
    addr = align(addr, page_size);
    const offset = (is_back ? -1 : 1) * page_size;
    while (true) {
        if (check_magic_at(addr, is_text)) {
            break;
        }
        addr = addr.add(offset)
    }
    return addr;
}
function get_view_vector(view) {
    if (!ArrayBuffer.isView(view)) {
        throw TypeError(`object not a JSC::JSArrayBufferView: ${view}`);
    }
    return mem.addrof(view).readp(view_m_vector);
}
function resolve_import(import_addr) {
    if (import_addr.read16(0) !== 0x25ff) {
        throw Error(
            `instruction at ${import_addr} is not of the form: jmp qword`
            + ' [rip + X]'
        );
    }
    const disp = import_addr.read32(2);
    const offset = new Int(disp, disp >> 31);
    const function_addr = import_addr.readp(offset.add(6));
    return function_addr;
}
function init_syscall_array(
    syscall_array,
    libkernel_web_base,
    max_search_size,
) {
    if (typeof max_search_size !== 'number') {
        throw TypeError(`max_search_size is not a number: ${max_search_size}`);
    }
    if (max_search_size < 0) {
        throw Error(`max_search_size is less than 0: ${max_search_size}`);
    }
    const libkernel_web_buffer = make_buffer(
        libkernel_web_base,
        max_search_size,
    );
    const kbuf = new Uint8Array(libkernel_web_buffer);
    let text_size = 0;
    let found = false;
    for (let i = 0; i < max_search_size; i++) {
        if (kbuf[i] === 0x72
            && kbuf[i + 1] === 0x64
            && kbuf[i + 2] === 0x6c
            && kbuf[i + 3] === 0x6f
        ) {
            text_size = i;
            found = true;
            break;
        }
    }
    if (!found) {
        throw Error(
            '"rdlo" string not found in libkernel_web, base address:'
            + ` ${libkernel_web_base}`
        );
    }
    for (let i = 0; i < text_size; i++) {
        if (kbuf[i] === 0x48
            && kbuf[i + 1] === 0xc7
            && kbuf[i + 2] === 0xc0
            && kbuf[i + 7] === 0x49
            && kbuf[i + 8] === 0x89
            && kbuf[i + 9] === 0xca
            && kbuf[i + 10] === 0x0f
            && kbuf[i + 11] === 0x05
        ) {
            const syscall_num = read32(kbuf, i + 3);
            syscall_array[syscall_num] = libkernel_web_base.add(i);
            i += 11;
        }
    }
}
function read(u8_view, offset, size) {
    let res = 0;
    for (let i = 0; i < size; i++) {
        res += u8_view[offset + i] << i * 8;
    }
    return res >>> 0;
}
function read16(u8_view, offset) {
    return read(u8_view, offset, 2);
}
function read32(u8_view, offset) {
    return read(u8_view, offset, 4);
}
function read64(u8_view, offset) {
    let res = [];
    for (let i = 0; i < 8; i++) {
        res.push(u8_view[offset + i]);
    }
    return new Int(res);
}
function write(u8_view, offset, value, size) {
    for (let i = 0; i < size; i++) {
        u8_view[offset + i] = (value >>> i * 8) & 0xff;
    }
}
function write16(u8_view, offset, value) {
    write(u8_view, offset, value, 2);
}
function write32(u8_view, offset, value) {
    write(u8_view, offset, value, 4);
}
function write64(u8_view, offset, value) {
    if (!(value instanceof Int)) {
        throw TypeError('write64 value must be an Int');
    }
    let low = value.low();
    let high = value.high();

    for (let i = 0; i < 4; i++) {
        u8_view[offset + i] = (low >>> i * 8) & 0xff;
    }
    for (let i = 0; i < 4; i++) {
        u8_view[offset + 4 + i] = (high >>> i * 8) & 0xff;
    }
}
function sread64(str, offset) {
    let res = [];
    for (let i = 0; i < 8; i++) {
        res.push(str.charCodeAt(offset + i));
    }
    return new Int(res);
}
const SYS_SYSCALL = 0x000;
const SYS_EXIT = 0x001;
const SYS_FORK = 0x002;
const SYS_READ = 0x003;
const SYS_WRITE = 0x004;
const SYS_OPEN = 0x005;
const SYS_CLOSE = 0x006;
const SYS_WAIT4 = 0x007;
const SYS_UNLINK = 0x00A;
const SYS_OBS_EXECV = 0x00B;
const SYS_CHDIR = 0x00C;
const SYS_CHMOD = 0x00F;
const SYS_OBSOLETE17 = 0x011;
const SYS_GETPID = 0x014;
const SYS_SETUID = 0x017;
const SYS_GETUID = 0x018;
const SYS_GETEUID = 0x019;
const SYS_RECVMSG = 0x01B;
const SYS_SENDMSG = 0x01C;
const SYS_RECVFROM = 0x01D;
const SYS_ACCEPT = 0x01E;
const SYS_GETPEERNAME = 0x01F;
const SYS_GETSOCKNAME = 0x020;
const SYS_ACCESS = 0x021;
const SYS_CHFLAGS = 0x022;
const SYS_FCHFLAGS = 0x023;
const SYS_SYNC = 0x024;
const SYS_KILL = 0x025;
const SYS_GETPPID = 0x027;
const SYS_DUP = 0x029;
const SYS_GETEGID = 0x02B;
const SYS_PROFIL = 0x02C;
const SYS_GETGID = 0x02F;
const SYS_GETLOGIN = 0x031;
const SYS_SETLOGIN = 0x032;
const SYS_OBSOLETE51 = 0x033;
const SYS_SIGALTSTACK = 0x035;
const SYS_IOCTL = 0x036;
const SYS_REBOOT = 0x037;
const SYS_REVOKE = 0x038;
const SYS_EXECVE = 0x03B;
const SYS_MSYNC = 0x041;
const SYS_OBS_VREAD = 0x043;
const SYS_OBS_VWRITE = 0x044;
const SYS_OBSOLETE72 = 0x048;
const SYS_MUNMAP = 0x049;
const SYS_MPROTECT = 0x04A;
const SYS_MADVISE = 0x04B;
const SYS_OBS_VHANGUP = 0x04C;
const SYS_OBS_VLIMIT = 0x04D;
const SYS_MINCORE = 0x04E;
const SYS_GETGROUPS = 0x04F;
const SYS_SETGROUPS = 0x050;
const SYS_SETITIMER = 0x053;
const SYS_GETITIMER = 0x056;
const SYS_GETDTABLESIZE = 0x059;
const SYS_DUP2 = 0x05A;
const SYS_NUMBER91 = 0x05B;
const SYS_FCNTL = 0x05C;
const SYS_SELECT = 0x05D;
const SYS_NUMBER94 = 0x05E;
const SYS_FSYNC = 0x05F;
const SYS_SETPRIORITY = 0x060;
const SYS_SOCKET = 0x061;
const SYS_CONNECT = 0x062;
const SYS_NETCONTROL = 0x063;
const SYS_GETPRIORITY = 0x064;
const SYS_NETABORT = 0x065;
const SYS_NETGETSOCKINFO = 0x066;
const SYS_BIND = 0x068;
const SYS_SETSOCKOPT = 0x069;
const SYS_LISTEN = 0x06A;
const SYS_OBS_VTIMES = 0x06B;
const SYS_SOCKETEX = 0x071;
const SYS_SOCKETCLOSE = 0x072;
const SYS_OBS_VTRACE = 0x073;
const SYS_GETTIMEOFDAY = 0x074;
const SYS_GETRUSAGE = 0x075;
const SYS_GETSOCKOPT = 0x076;
const SYS_NUMBER119 = 0x077;
const SYS_READV = 0x078;
const SYS_WRITEV = 0x079;
const SYS_SETTIMEOFDAY = 0x07A;
const SYS_FCHMOD = 0x07C;
const SYS_NETGETIFLIST = 0x07D;
const SYS_SETREUID = 0x07E;
const SYS_SETREGID = 0x07F;
const SYS_RENAME = 0x080;
const SYS_FLOCK = 0x083;
const SYS_SENDTO = 0x085;
const SYS_SHUTDOWN = 0x086;
const SYS_SOCKETPAIR = 0x087;
const SYS_MKDIR = 0x088;
const SYS_RMDIR = 0x089;
const SYS_UTIMES = 0x08A;
const SYS_ADJTIME = 0x08C;
const SYS_KQUEUEEX = 0x08D;
const SYS_SETSID = 0x093;
const SYS_OBSOLETE148 = 0x094;
const SYS_NUMBER151 = 0x097;
const SYS_NUMBER152 = 0x098;
const SYS_NUMBER153 = 0x099;
const SYS_NUMBER159 = 0x09F;
const SYS_OBSOLETE160 = 0x0A0;
const SYS_OBSOLETE161 = 0x0A1;
const SYS_SYSARCH = 0x0A5;
const SYS_NUMBER167 = 0x0A7;
const SYS_NUMBER168 = 0x0A8;
const SYS_NUMBER172 = 0x0AC;
const SYS_OBSOLETE173 = 0x0AD;
const SYS_OBSOLETE174 = 0x0AE;
const SYS_OBSOLETE175 = 0x0AF;
const SYS_OBSOLETE176 = 0x0B0;
const SYS_NUMBER177 = 0x0B1;
const SYS_NUMBER178 = 0x0B2;
const SYS_NUMBER179 = 0x0B3;
const SYS_NUMBER180 = 0x0B4;
const SYS_SETEGID = 0x0B6;
const SYS_SETEUID = 0x0B7;
const SYS_NUMBER184 = 0x0B8;
const SYS_NUMBER185 = 0x0B9;
const SYS_NUMBER186 = 0x0BA;
const SYS_NUMBER187 = 0x0BB;
const SYS_STAT = 0x0BC;
const SYS_FSTAT = 0x0BD;
const SYS_LSTAT = 0x0BE;
const SYS_PATHCONF = 0x0BF;
const SYS_FPATHCONF = 0x0C0;
const SYS_NUMBER193 = 0x0C1;
const SYS_GETRLIMIT = 0x0C2;
const SYS_SETRLIMIT = 0x0C3;
const SYS_GETDIRENTRIES = 0x0C4;
const SYS_OBSOLETE197 = 0x0C5;
const SYS_OBSOLETE199 = 0x0C7;
const SYS_OBSOLETE200 = 0x0C8;
const SYS_OBSOLETE201 = 0x0C9;
const SYS___SYSCTL = 0x0CA;
const SYS_MLOCK = 0x0CB;
const SYS_MUNLOCK = 0x0CC;
const SYS_OBSOLETE205 = 0x0CD;
const SYS_FUTIMES = 0x0CE;
const SYS_NUMBER208 = 0x0D0;
const SYS_POLL = 0x0D1;
const SYS_NUMBER223 = 0x0DF;
const SYS_CLOCK_GETTIME = 0x0E8;
const SYS_CLOCK_SETTIME = 0x0E9;
const SYS_CLOCK_GETRES = 0x0EA;
const SYS_KTIMER_CREATE = 0x0EB;
const SYS_KTIMER_DELETE = 0x0EC;
const SYS_KTIMER_SETTIME = 0x0ED;
const SYS_KTIMER_GETTIME = 0x0EE;
const SYS_KTIMER_GETOVERRUN = 0x0EF;
const SYS_NANOSLEEP = 0x0F0;
const SYS_NUMBER241 = 0x0F1;
const SYS_NUMBER242 = 0x0F2;
const SYS_NUMBER243 = 0x0F3;
const SYS_NUMBER244 = 0x0F4;
const SYS_NUMBER245 = 0x0F5;
const SYS_NUMBER246 = 0x0F6;
const SYS_NUMBER247 = 0x0F7;
const SYS_OBSOLETE248 = 0x0F8;
const SYS_NUMBER249 = 0x0F9;
const SYS_RFORK = 0x0FB;
const SYS_OBSOLETE252 = 0x0FC;
const SYS_ISSETUGID = 0x0FD;
const SYS_OBSOLETE257 = 0x101;
const SYS_NUMBER258 = 0x102;
const SYS_NUMBER259 = 0x103;
const SYS_NUMBER260 = 0x104;
const SYS_NUMBER261 = 0x105;
const SYS_NUMBER262 = 0x106;
const SYS_NUMBER263 = 0x107;
const SYS_NUMBER264 = 0x108;
const SYS_NUMBER265 = 0x109;
const SYS_NUMBER266 = 0x10A;
const SYS_NUMBER267 = 0x10B;
const SYS_NUMBER268 = 0x10C;
const SYS_NUMBER269 = 0x10D;
const SYS_NUMBER270 = 0x10E;
const SYS_NUMBER271 = 0x10F;
const SYS_GETDENTS = 0x110;
const SYS_NUMBER273 = 0x111;
const SYS_OBSOLETE278 = 0x116;
const SYS_OBSOLETE279 = 0x117;
const SYS_OBSOLETE280 = 0x118;
const SYS_NUMBER281 = 0x119;
const SYS_NUMBER282 = 0x11A;
const SYS_NUMBER283 = 0x11B;
const SYS_NUMBER284 = 0x11C;
const SYS_NUMBER285 = 0x11D;
const SYS_NUMBER286 = 0x11E;
const SYS_NUMBER287 = 0x11F;
const SYS_NUMBER288 = 0x120;
const SYS_PREADV = 0x121;
const SYS_PWRITEV = 0x122;
const SYS_NUMBER291 = 0x123;
const SYS_NUMBER292 = 0x124;
const SYS_NUMBER293 = 0x125;
const SYS_NUMBER294 = 0x126;
const SYS_NUMBER295 = 0x127;
const SYS_NUMBER296 = 0x128;
const SYS_OBSOLETE298 = 0x12A;
const SYS_OBSOLETE299 = 0x12B;
const SYS_OBSOLETE300 = 0x12C;
const SYS_OBSOLETE301 = 0x12D;
const SYS_OBSOLETE302 = 0x12E;
const SYS_OBSOLETE303 = 0x12F;
const SYS_GETSID = 0x136;
const SYS_OBS_SIGNANOSLEEP = 0x139;
const SYS_AIO_SUSPEND = 0x13B;
const SYS_OBSOLETE318 = 0x13E;
const SYS_OBSOLETE319 = 0x13F;
const SYS_OBSOLETE320 = 0x140;
const SYS_OBS_THR_SLEEP = 0x142;
const SYS_OBS_THR_WAKEUP = 0x143;
const SYS_MLOCKALL = 0x144;
const SYS_MUNLOCKALL = 0x145;
const SYS_SCHED_SETPARAM = 0x147;
const SYS_SCHED_GETPARAM = 0x148;
const SYS_SCHED_SETSCHEDULER = 0x149;
const SYS_SCHED_GETSCHEDULER = 0x14A;
const SYS_SCHED_YIELD = 0x14B;
const SYS_SCHED_GET_PRIORITY_MAX = 0x14C;
const SYS_SCHED_GET_PRIORITY_MIN = 0x14D;
const SYS_SCHED_RR_GET_INTERVAL = 0x14E;
const SYS_OBSOLETE338 = 0x152;
const SYS_SIGPROCMASK = 0x154;
const SYS_SIGSUSPEND = 0x155;
const SYS_SIGPENDING = 0x157;
const SYS_SIGTIMEDWAIT = 0x159;
const SYS_SIGWAITINFO = 0x15A;
const SYS_OBSOLETE347 = 0x15B;
const SYS_OBSOLETE348 = 0x15C;
const SYS_OBSOLETE349 = 0x15D;
const SYS_OBSOLETE350 = 0x15E;
const SYS_OBSOLETE351 = 0x15F;
const SYS_OBSOLETE352 = 0x160;
const SYS_OBSOLETE353 = 0x161;
const SYS_OBSOLETE354 = 0x162;
const SYS_OBSOLETE355 = 0x163;
const SYS_OBSOLETE356 = 0x164;
const SYS_OBSOLETE357 = 0x165;
const SYS_OBSOLETE358 = 0x166;
const SYS_KQUEUE = 0x16A;
const SYS_KEVENT = 0x16B;
const SYS_NUMBER364 = 0x16C;
const SYS_NUMBER365 = 0x16D;
const SYS_NUMBER366 = 0x16E;
const SYS_NUMBER367 = 0x16F;
const SYS_NUMBER368 = 0x170;
const SYS_NUMBER369 = 0x171;
const SYS_NUMBER370 = 0x172;
const SYS_OBSOLETE371 = 0x173;
const SYS_OBSOLETE372 = 0x174;
const SYS_OBSOLETE373 = 0x175;
const SYS_NUMBER375 = 0x177;
const SYS_OBSOLETE376 = 0x178;
const SYS_MTYPEPROTECT = 0x17B;
const SYS_NUMBER380 = 0x17C;
const SYS_NUMBER381 = 0x17D;
const SYS_NUMBER382 = 0x17E;
const SYS_NUMBER383 = 0x17F;
const SYS_UUIDGEN = 0x188;
const SYS_SENDFILE = 0x189;
const SYS_FSTATFS = 0x18D;
const SYS_OBSOLETE398 = 0x18E;
const SYS_NUMBER399 = 0x18F;
const SYS_KSEM_CLOSE = 0x190;
const SYS_KSEM_POST = 0x191;
const SYS_KSEM_WAIT = 0x192;
const SYS_KSEM_TRYWAIT = 0x193;
const SYS_KSEM_INIT = 0x194;
const SYS_KSEM_OPEN = 0x195;
const SYS_KSEM_UNLINK = 0x196;
const SYS_KSEM_GETVALUE = 0x197;
const SYS_KSEM_DESTROY = 0x198;
const SYS_OBSOLETE412 = 0x19C;
const SYS_OBSOLETE413 = 0x19D;
const SYS_OBSOLETE414 = 0x19E;
const SYS_SIGACTION = 0x1A0;
const SYS_SIGRETURN = 0x1A1;
const SYS_NUMBER418 = 0x1A2;
const SYS_NUMBER419 = 0x1A3;
const SYS_NUMBER420 = 0x1A4;
const SYS_GETCONTEXT = 0x1A5;
const SYS_SETCONTEXT = 0x1A6;
const SYS_SWAPCONTEXT = 0x1A7;
const SYS_OBSOLETE424 = 0x1A8;
const SYS_OBSOLETE425 = 0x1A9;
const SYS_OBSOLETE426 = 0x1AA;
const SYS_OBSOLETE427 = 0x1AB;
const SYS_OBSOLETE428 = 0x1AC;
const SYS_SIGWAIT = 0x1AD;
const SYS_THR_CREATE = 0x1AE;
const SYS_THR_EXIT = 0x1AF;
const SYS_THR_SELF = 0x1B0;
const SYS_THR_KILL = 0x1B1;
const SYS_NUMBER434 = 0x1B2;
const SYS_NUMBER435 = 0x1B3;
const SYS_OBSOLETE436 = 0x1B4;
const SYS_OBSOLETE437 = 0x1B5;
const SYS_OBSOLETE438 = 0x1B6;
const SYS_OBSOLETE439 = 0x1B7;
const SYS_NUMBER440 = 0x1B8;
const SYS_KSEM_TIMEDWAIT = 0x1B9;
const SYS_THR_SUSPEND = 0x1BA;
const SYS_THR_WAKE = 0x1BB;
const SYS_KLDUNLOADF = 0x1BC;
const SYS_OBSOLETE445 = 0x1BD;
const SYS_OBSOLETE446 = 0x1BE;
const SYS_OBSOLETE447 = 0x1BF;
const SYS_OBSOLETE448 = 0x1C0;
const SYS_OBSOLETE449 = 0x1C1;
const SYS_OBSOLETE450 = 0x1C2;
const SYS_OBSOLETE451 = 0x1C3;
const SYS_OBSOLETE452 = 0x1C4;
const SYS_OBSOLETE453 = 0x1C5;
const SYS__UMTX_OP = 0x1C6;
const SYS_THR_NEW = 0x1C7;
const SYS_SIGQUEUE = 0x1C8;
const SYS_OBSOLETE463 = 0x1CF;
const SYS_THR_SET_NAME = 0x1D0;
const SYS_RTPRIO_THREAD = 0x1D2;
const SYS_NUMBER467 = 0x1D3;
const SYS_NUMBER468 = 0x1D4;
const SYS_NUMBER469 = 0x1D5;
const SYS_NUMBER470 = 0x1D6;
const SYS_OBSOLETE471 = 0x1D7;
const SYS_OBSOLETE472 = 0x1D8;
const SYS_OBSOLETE473 = 0x1D9;
const SYS_OBSOLETE474 = 0x1DA;
const SYS_PREAD = 0x1DB;
const SYS_PWRITE = 0x1DC;
const SYS_MMAP = 0x1DD;
const SYS_LSEEK = 0x1DE;
const SYS_TRUNCATE = 0x1DF;
const SYS_FTRUNCATE = 0x1E0;
const SYS_THR_KILL2 = 0x1E1;
const SYS_SHM_OPEN = 0x1E2;
const SYS_SHM_UNLINK = 0x1E3;
const SYS_CPUSET_GETID = 0x1E6;
const SYS_PS4_CPUSET_GETAFFINITY = 0x1E7;
const SYS_PS4_CPUSET_SETAFFINITY = 0x1E8;
const SYS_OBSOLETE489 = 0x1E9;
const SYS_OBSOLETE492 = 0x1EC;
const SYS_OPENAT = 0x1F3;
const SYS_OBSOLETE500 = 0x1F4;
const SYS_OBSOLETE504 = 0x1F8;
const SYS_OBSOLETE506 = 0x1FA;
const SYS_OBSOLETE507 = 0x1FB;
const SYS_OBSOLETE508 = 0x1FC;
const SYS_OBSOLETE509 = 0x1FD;
const SYS_OBSOLETE513 = 0x201;
const SYS_OBS_CAP_NEW = 0x202;
const SYS___CAP_RIGHTS_GET = 0x203;
const SYS_NUMBER521 = 0x209;
const SYS_PSELECT = 0x20A;
const SYS_OBSOLETE523 = 0x20B;
const SYS_OBSOLETE524 = 0x20C;
const SYS_OBSOLETE530 = 0x212;
const SYS_NUMBER531 = 0x213;
const SYS_REGMGR_CALL = 0x214;
const SYS_JITSHM_CREATE = 0x215;
const SYS_JITSHM_ALIAS = 0x216;
const SYS_DL_GET_LIST = 0x217;
const SYS_DL_GET_INFO = 0x218;
const SYS_OBSOLETE537 = 0x219;
const SYS_EVF_CREATE = 0x21A;
const SYS_EVF_DELETE = 0x21B;
const SYS_EVF_OPEN = 0x21C;
const SYS_EVF_CLOSE = 0x21D;
const SYS_EVF_WAIT = 0x21E;
const SYS_EVF_TRYWAIT = 0x21F;
const SYS_EVF_SET = 0x220;
const SYS_EVF_CLEAR = 0x221;
const SYS_EVF_CANCEL = 0x222;
const SYS_QUERY_MEMORY_PROTECTION = 0x223;
const SYS_BATCH_MAP = 0x224;
const SYS_OSEM_CREATE = 0x225;
const SYS_OSEM_DELETE = 0x226;
const SYS_OSEM_OPEN = 0x227;
const SYS_OSEM_CLOSE = 0x228;
const SYS_OSEM_WAIT = 0x229;
const SYS_OSEM_TRYWAIT = 0x22A;
const SYS_OSEM_POST = 0x22B;
const SYS_OSEM_CANCEL = 0x22C;
const SYS_NAMEDOBJ_CREATE = 0x22D;
const SYS_NAMEDOBJ_DELETE = 0x22E;
const SYS_SET_VM_CONTAINER = 0x22F;
const SYS_DEBUG_INIT = 0x230;
const SYS_OPMC_ENABLE = 0x233;
const SYS_OPMC_DISABLE = 0x234;
const SYS_OPMC_SET_CTL = 0x235;
const SYS_OPMC_SET_CTR = 0x236;
const SYS_OPMC_GET_CTR = 0x237;
const SYS_VIRTUAL_QUERY = 0x23C;
const SYS_OBS_SBLOCK_CREATE = 0x23E;
const SYS_OBS_SBLOCK_DELETE = 0x23F;
const SYS_OBS_SBLOCK_ENTER = 0x240;
const SYS_OBS_SBLOCK_EXIT = 0x241;
const SYS_OBS_SBLOCK_XENTER = 0x242;
const SYS_OBS_SBLOCK_XEXIT = 0x243;
const SYS_OBS_EPORT_CREATE = 0x244;
const SYS_OBS_EPORT_DELETE = 0x245;
const SYS_OBS_EPORT_TRIGGER = 0x246;
const SYS_OBS_EPORT_OPEN = 0x247;
const SYS_OBS_EPORT_CLOSE = 0x248;
const SYS_IS_IN_SANDBOX = 0x249;
const SYS_DMEM_CONTAINER = 0x24A;
const SYS_GET_AUTHINFO = 0x24B;
const SYS_MNAME = 0x24C;
const SYS_DYNLIB_DLSYM = 0x24F;
const SYS_DYNLIB_GET_LIST = 0x250;
const SYS_DYNLIB_GET_INFO = 0x251;
const SYS_DYNLIB_LOAD_PRX = 0x252;
const SYS_DYNLIB_UNLOAD_PRX = 0x253;
const SYS_DYNLIB_DO_COPY_RELOCATIONS = 0x254;
const SYS_DYNLIB_GET_PROC_PARAM = 0x256;
const SYS_DYNLIB_PROCESS_NEEDED_AND_RELOCATE = 0x257;
const SYS_SANDBOX_PATH = 0x258;
const SYS_MDBG_SERVICE = 0x259;
const SYS_RANDOMIZED_PATH = 0x25A;
const SYS_RDUP = 0x25B;
const SYS_DL_GET_METADATA = 0x25C;
const SYS_WORKAROUND8849 = 0x25D;
const SYS_IS_DEVELOPMENT_MODE = 0x25E;
const SYS_GET_SELF_AUTH_INFO = 0x25F;
const SYS_DYNLIB_GET_INFO_EX = 0x260;
const SYS_BUDGET_GET_PTYPE = 0x262;
const SYS_GET_PAGING_STATS_OF_ALL_THREADS = 0x263;
const SYS_GET_PROC_TYPE_INFO = 0x264;
const SYS_GET_RESIDENT_COUNT = 0x265;
const SYS_GET_RESIDENT_FMEM_COUNT = 0x267;
const SYS_THR_GET_NAME = 0x268;
const SYS_SET_GPO = 0x269;
const SYS_GET_PAGING_STATS_OF_ALL_OBJECTS = 0x26A;
const SYS_TEST_DEBUG_RWMEM = 0x26B;
const SYS_FREE_STACK = 0x26C;
const SYS_IPMIMGR_CALL = 0x26E;
const SYS_GET_GPO = 0x26F;
const SYS_GET_VM_MAP_TIMESTAMP = 0x270;
const SYS_OPMC_SET_HW = 0x271;
const SYS_OPMC_GET_HW = 0x272;
const SYS_GET_CPU_USAGE_ALL = 0x273;
const SYS_MMAP_DMEM = 0x274;
const SYS_PHYSHM_OPEN = 0x275;
const SYS_PHYSHM_UNLINK = 0x276;
const SYS_THR_SUSPEND_UCONTEXT = 0x278;
const SYS_THR_RESUME_UCONTEXT = 0x279;
const SYS_THR_GET_UCONTEXT = 0x27A;
const SYS_THR_SET_UCONTEXT = 0x27B;
const SYS_SET_TIMEZONE_INFO = 0x27C;
const SYS_SET_PHYS_FMEM_LIMIT = 0x27D;
const SYS_UTC_TO_LOCALTIME = 0x27E;
const SYS_LOCALTIME_TO_UTC = 0x27F;
const SYS_SET_UEVT = 0x280;
const SYS_GET_CPU_USAGE_PROC = 0x281;
const SYS_GET_MAP_STATISTICS = 0x282;
const SYS_SET_CHICKEN_SWITCHES = 0x283;
const SYS_NUMBER644 = 0x284;
const SYS_NUMBER645 = 0x285;
const SYS_GET_KERNEL_MEM_STATISTICS = 0x286;
const SYS_GET_SDK_COMPILED_VERSION = 0x287;
const SYS_APP_STATE_CHANGE = 0x288;
const SYS_DYNLIB_GET_OBJ_MEMBER = 0x289;
const SYS_PROCESS_TERMINATE = 0x28C;
const SYS_BLOCKPOOL_OPEN = 0x28D;
const SYS_BLOCKPOOL_MAP = 0x28E;
const SYS_BLOCKPOOL_UNMAP = 0x28F;
const SYS_DYNLIB_GET_INFO_FOR_LIBDBG = 0x290;
const SYS_BLOCKPOOL_BATCH = 0x291;
const SYS_FDATASYNC = 0x292;
const SYS_DYNLIB_GET_LIST2 = 0x293;
const SYS_DYNLIB_GET_INFO2 = 0x294;
const SYS_AIO_SUBMIT = 0x295;
const SYS_AIO_MULTI_DELETE = 0x296;
const SYS_AIO_MULTI_WAIT = 0x297;
const SYS_AIO_MULTI_POLL = 0x298;
const SYS_AIO_GET_DATA = 0x299;
const SYS_AIO_MULTI_CANCEL = 0x29A;
const SYS_GET_BIO_USAGE_ALL = 0x29B;
const SYS_AIO_CREATE = 0x29C;
const SYS_AIO_SUBMIT_CMD = 0x29D;
const SYS_AIO_INIT = 0x29E;
const SYS_GET_PAGE_TABLE_STATS = 0x29F;
const SYS_DYNLIB_GET_LIST_FOR_LIBDBG = 0x2A0;
const SYS_BLOCKPOOL_MOVE = 0x2A1;
const SYS_VIRTUAL_QUERY_ALL = 0x2A2;
const SYS_RESERVE_2MB_PAGE = 0x2A3;
const SYS_CPUMODE_YIELD = 0x2A4;
const SYS_WAIT6 = 0x2A5;
const SYS_CAP_RIGHTS_LIMIT = 0x2A6;
const SYS_CAP_IOCTLS_LIMIT = 0x2A7;
const SYS_CAP_IOCTLS_GET = 0x2A8;
const SYS_CAP_FCNTLS_LIMIT = 0x2A9;
const SYS_CAP_FCNTLS_GET = 0x2AA;
const SYS_BINDAT = 0x2AB;
const SYS_CONNECTAT = 0x2AC;
const SYS_CHFLAGSAT = 0x2AD;
const SYS_ACCEPT4 = 0x2AE;
const SYS_PIPE2 = 0x2AF;
const SYS_AIO_MLOCK = 0x2B0;
const SYS_PROCCTL = 0x2B1;
const SYS_PPOLL = 0x2B2;
const SYS_FUTIMENS = 0x2B3;
const SYS_UTIMENSAT = 0x2B4;
const SYS_NUMA_GETAFFINITY = 0x2B5;
const SYS_NUMA_SETAFFINITY = 0x2B6;
const SYS_NUMBER695 = 0x2B7;
const SYS_NUMBER696 = 0x2B8;
const SYS_NUMBER697 = 0x2B9;
const SYS_NUMBER698 = 0x2BA;
const SYS_NUMBER699 = 0x2BB;
const SYS_APR_SUBMIT = 0x2BC;
const SYS_APR_RESOLVE = 0x2BD;
const SYS_APR_STAT = 0x2BE;
const SYS_APR_WAIT = 0x2BF;
const SYS_APR_CTRL = 0x2C0;
const SYS_GET_PHYS_PAGE_SIZE = 0x2C1;
const SYS_BEGIN_APP_MOUNT = 0x2C2;
const SYS_END_APP_MOUNT = 0x2C3;
const SYS_FSC2H_CTRL = 0x2C4;
const SYS_STREAMWRITE = 0x2C5;
const SYS_APP_SAVE = 0x2C6;
const SYS_APP_RESTORE = 0x2C7;
const SYS_SAVED_APP_DELETE = 0x2C8;
const SYS_GET_PPR_SDK_COMPILED_VERSION = 0x2C9;
const SYS_NOTIFY_APP_EVENT = 0x2CA;
const SYS_IOREQ = 0x2CB;
const SYS_OPENINTR = 0x2CC;
const SYS_DL_GET_INFO_2 = 0x2CD;
const SYS_ACINFO_ADD = 0x2CE;
const SYS_ACINFO_DELETE = 0x2CF;
const SYS_ACINFO_GET_ALL_FOR_COREDUMP = 0x2D0;
const SYS_AMPR_CTRL_DEBUG = 0x2D1;