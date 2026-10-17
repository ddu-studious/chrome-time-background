// 礼让用户：验收脚本要抢键盘焦点、移动鼠标、切前台应用，用户正在打字或用鼠标时这样做，会把他的按键送进测试面板。
// 所以：开始前先等用户安静一阵；运行中一旦发现真实输入就立刻中止当前场景，等他重新安静后再重跑这个场景（场景之间互相独立，
// 每个都用全新的原生进程），多次被打断才以退出码 75 结束，由外层稍后重试，不当成“验收失败”。
// “真实输入”按 IOHIDSystem 的 HIDIdleTime（距上一次任何键盘 / 鼠标 / 触控板事件的时间）判断；我们自己用 mouse-helper 合成的输入
// 同样会重置它，所以调用方每次合成输入后必须 touch()，只把“比我们最后一次合成输入更晚”的事件算作用户。
// 只读系统的空闲时间，不读取任何按键内容，不需要额外权限。
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export const EXIT_USER_ACTIVE = 75;     // sysexits.h 的 EX_TEMPFAIL：暂时无法完成，稍后重试

/** 距上一次真实或合成的键盘 / 鼠标事件的秒数；读不到时按“很久”处理（不阻塞验收，但失去礼让保护）。 */
export function idleSeconds() {
  try {
    const match = execFileSync('/usr/sbin/ioreg', ['-c', 'IOHIDSystem'], { encoding: 'utf8', timeout: 3000, maxBuffer: 16 * 1024 * 1024 }).match(/"HIDIdleTime"\s*=\s*(\d+)/);
    return match ? Number(match[1]) / 1e9 : Infinity;
  } catch { return Infinity; }
}

export class Quiet {
  /**
   * seconds：开始前用户至少这么久没碰键盘与鼠标；0 表示关闭礼让（只在无人值守的环境里用）。
   * deps 只给单元测试注入假的空闲时间、时钟和睡眠（test/user-quiet.test.mjs）。
   */
  constructor(seconds = 20, { idle = idleSeconds, now = Date.now, sleep = delay } = {}) {
    this.seconds = seconds;
    this.idle = idle; this.now = now; this.sleep = sleep;
    this.lastSynthetic = this.now();
    this.verified = false;      // 是否已经确认过“用户安静”；之后只要没有更晚的真实输入，场景之间不必再各等一遍
  }

  /** 每次合成键盘 / 鼠标输入之后调用：这之前的空闲时间重置是我们自己造成的。 */
  touch() { this.lastSynthetic = this.now(); }

  /** 自上一次确认安静（或我们自己的合成输入）以来，有没有更晚的真实输入。返回 null 表示没有，否则是原因文字。 */
  intrusion() {
    const idle = this.idle(), since = (this.now() - this.lastSynthetic) / 1000;
    return idle + 0.7 < since ? `检测到真实键盘或鼠标输入（空闲 ${idle.toFixed(1)} 秒，距我们上一次合成输入 ${since.toFixed(1)} 秒）` : null;
  }

  /** 等到用户安静 seconds 秒；等太久（默认 15 分钟）就放弃，不无限占着。 */
  async wait(maxMinutes = 15, log = console.log) {
    if (!this.seconds) return;
    const deadline = this.now() + maxMinutes * 60_000;
    let announced = false;
    while (this.idle() < this.seconds) {
      if (!announced) { log(`  （用户正在使用键盘或鼠标，等他安静 ${this.seconds} 秒后再继续，避免把按键抢进测试面板…）`); announced = true; }
      if (this.now() > deadline) throw new Error(`等了 ${maxMinutes} 分钟用户仍在使用电脑，放弃本次验收`);
      await this.sleep(2000);
    }
    this.verified = true;
    this.touch();
  }

  /** 场景开始前调用：第一次必须等到安静；之后如果自上次确认以来没有真实输入（我们自己的合成输入已经扣除）就直接继续，用户回来了才再等。 */
  async waitIfActive(maxMinutes = 15, log = console.log) {
    if (!this.seconds) return;
    if (this.verified && this.intrusion() === null) return;
    await this.wait(maxMinutes, log);
  }

  /** 运行期间盯着：发现比我们最后一次合成输入更晚的真实输入就调用 onUser(原因)，只触发一次。返回停止函数。 */
  watch(onUser) {
    if (!this.seconds) return () => {};
    let fired = false;
    const timer = setInterval(() => {
      if (fired) return;
      const reason = this.intrusion();
      if (reason) { fired = true; onUser(reason); }
    }, 400);
    return () => clearInterval(timer);
  }
}
