/**
 * Cross-platform PCM capture for Realtime `input_audio` (24 kHz mono int16).
 * Exposed as `globalThis.workshopAudioCapture`.
 */
(function initWorkshopAudioCapture(global) {
  const REALTIME_SAMPLE_RATE = 24000;
  /** 100 ms @ 24 kHz — balances SCTP message size vs. overhead. */
  const APPEND_CHUNK_SAMPLES = 2400;
  /** Above this, use `input_audio_buffer.append` instead of one fat `conversation.item.create`. */
  const SINGLE_ITEM_MAX_SAMPLES = 12000;
  const DECODE_TIMEOUT_MS = 15000;
  const SCRIPT_PROCESSOR_BUFFER = 4096;

  /**
   * @param {Int16Array | ArrayBuffer} pcm
   */
  function int16ToBase64(pcm) {
    const bytes =
      pcm instanceof Int16Array
        ? new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
        : new Uint8Array(pcm);
    let binary = "";
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + step, bytes.length)));
    }
    return btoa(binary);
  }

  /**
   * @param {string} b64
   * @returns {Int16Array}
   */
  function base64ToInt16(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  }

  /**
   * @param {Float32Array} input
   * @param {number} fromRate
   * @param {number} toRate
   */
  function resampleLinear(input, fromRate, toRate) {
    if (fromRate === toRate) return input;
    const ratio = fromRate / toRate;
    const outLen = Math.max(1, Math.floor(input.length / ratio));
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const srcPos = i * ratio;
      const j = Math.floor(srcPos);
      const f = srcPos - j;
      const a = input[j] ?? 0;
      const b = input[j + 1] ?? a;
      out[i] = a + (b - a) * f;
    }
    return out;
  }

  /**
   * @param {AudioBuffer} ab
   * @returns {Float32Array}
   */
  function float32MonoFromAudioBuffer(ab) {
    const n = ab.numberOfChannels;
    const len = ab.length;
    const out = new Float32Array(len);
    if (n === 1) {
      out.set(ab.getChannelData(0));
    } else {
      for (let i = 0; i < len; i++) {
        let s = 0;
        for (let c = 0; c < n; c++) s += ab.getChannelData(c)[i];
        out[i] = s / n;
      }
    }
    return out;
  }

  /**
   * @param {Float32Array} f32
   * @returns {Int16Array}
   */
  function floatToInt16(f32) {
    const out = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      const s = Math.max(-1, Math.min(1, f32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  /**
   * @param {number} sourceSampleRate
   * @param {number} [targetRate]
   */
  function createStreamingPcmResampler(sourceSampleRate, targetRate = REALTIME_SAMPLE_RATE) {
    const ratio = sourceSampleRate / targetRate;
    let carry = 0;
    /** @type {number[]} */
    let pendingFloat = [];

    return {
      /** @param {Float32Array} input @returns {Int16Array[]} */
      push(input) {
        /** @type {Int16Array[]} */
        const out = [];
        let pos = carry;
        while (pos < input.length) {
          const j = Math.floor(pos);
          const f = pos - j;
          const a = input[j] ?? 0;
          const b = input[j + 1] ?? a;
          pendingFloat.push(a + (b - a) * f);
          pos += ratio;
        }
        carry = pos - input.length;
        while (pendingFloat.length >= APPEND_CHUNK_SAMPLES) {
          const slice = pendingFloat.splice(0, APPEND_CHUNK_SAMPLES);
          out.push(floatToInt16(new Float32Array(slice)));
        }
        return out;
      },
      /** @returns {Int16Array} */
      flush() {
        if (!pendingFloat.length) return new Int16Array(0);
        const pcm = floatToInt16(new Float32Array(pendingFloat));
        pendingFloat = [];
        return pcm;
      },
    };
  }

  /**
   * @param {Int16Array[]} chunks
   */
  function mergePcmChunks(chunks) {
    let total = 0;
    for (const c of chunks) total += c.length;
    const pcm = new Int16Array(total);
    let off = 0;
    for (const c of chunks) {
      pcm.set(c, off);
      off += c.length;
    }
    return pcm;
  }

  /**
   * @param {AudioBuffer} audioBuffer
   * @param {number} [targetRate]
   */
  function audioBufferToPcm16(audioBuffer, targetRate = REALTIME_SAMPLE_RATE) {
    const mono = float32MonoFromAudioBuffer(audioBuffer);
    const resampled = resampleLinear(mono, audioBuffer.sampleRate, targetRate);
    return floatToInt16(resampled);
  }

  /**
   * @param {ArrayBuffer} buf
   */
  function isWavBuffer(buf) {
    if (buf.byteLength < 12) return false;
    const v = new DataView(buf);
    return v.getUint32(0, false) === 0x52494646 && v.getUint32(8, false) === 0x57415645;
  }

  /**
   * @param {ArrayBuffer} buf
   * @param {number} [targetRate]
   */
  function wavBufferToPcm16(buf, targetRate = REALTIME_SAMPLE_RATE) {
    const view = new DataView(buf);
    let offset = 12;
    let audioFormat = 1;
    let channels = 1;
    let sampleRate = 44100;
    let bitsPerSample = 16;
    /** @type {number | null} */
    let dataOffset = null;
    let dataSize = 0;

    while (offset + 8 <= buf.byteLength) {
      const id = view.getUint32(offset, false);
      const size = view.getUint32(offset + 4, true);
      const chunkStart = offset + 8;
      if (id === 0x666d7420) {
        audioFormat = view.getUint16(chunkStart, true);
        channels = view.getUint16(chunkStart + 2, true);
        sampleRate = view.getUint32(chunkStart + 4, true);
        bitsPerSample = view.getUint16(chunkStart + 14, true);
      } else if (id === 0x64617461) {
        dataOffset = chunkStart;
        dataSize = size;
        break;
      }
      offset = chunkStart + size + (size % 2);
    }

    if (dataOffset == null || dataSize < 1) {
      throw new Error("WAV data chunk missing");
    }
    if (audioFormat !== 1) {
      throw new Error("Only PCM WAV is supported — convert to 16-bit PCM WAV or use MP3.");
    }

    const bytes = new Uint8Array(buf, dataOffset, dataSize);
    /** @type {Float32Array} */
    let mono;
    if (bitsPerSample === 16) {
      const samples = dataSize / 2 / channels;
      mono = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        let s = 0;
        for (let c = 0; c < channels; c++) {
          const idx = (i * channels + c) * 2;
          s += view.getInt16(dataOffset + idx, true) / 32768;
        }
        mono[i] = s / channels;
      }
    } else if (bitsPerSample === 8) {
      const samples = dataSize / channels;
      mono = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        let s = 0;
        for (let c = 0; c < channels; c++) {
          s += (bytes[i * channels + c] - 128) / 128;
        }
        mono[i] = s / channels;
      }
    } else {
      throw new Error(`Unsupported WAV bit depth (${bitsPerSample}) — use 16-bit PCM WAV or MP3.`);
    }

    const resampled = resampleLinear(mono, sampleRate, targetRate);
    return floatToInt16(resampled);
  }

  /**
   * @param {AudioContext} ctx
   * @param {ArrayBuffer} arrayBuffer
   * @param {number} timeoutMs
   */
  function decodeAudioDataWithTimeout(ctx, arrayBuffer, timeoutMs = DECODE_TIMEOUT_MS) {
    const copy = arrayBuffer.slice(0);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Audio decode timed out — try WAV/MP3 or record in the browser."));
      }, timeoutMs);
      ctx
        .decodeAudioData(copy)
        .then((buf) => {
          clearTimeout(timer);
          resolve(buf);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /**
   * @param {Blob | File} file
   * @returns {Promise<Int16Array>}
   */
  async function fileToPcm16(file) {
    const arrayBuffer = await file.arrayBuffer();
    if (isWavBuffer(arrayBuffer)) {
      return wavBufferToPcm16(arrayBuffer, REALTIME_SAMPLE_RATE);
    }

    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) throw new Error("Web Audio is not available in this browser.");
    const ctx = new AC();
    try {
      await ctx.resume();
      const decoded = await decodeAudioDataWithTimeout(ctx, arrayBuffer);
      return audioBufferToPcm16(decoded, REALTIME_SAMPLE_RATE);
    } finally {
      await ctx.close();
    }
  }

  /**
   * @param {Int16Array} pcm
   * @param {number} [sampleRate]
   */
  function pcm16ToWavBlob(pcm, sampleRate = REALTIME_SAMPLE_RATE) {
    const dataBytes = pcm.length * 2;
    const buffer = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(buffer);
    const writeStr = (off, s) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + dataBytes, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, dataBytes, true);
    const out = new Int16Array(buffer, 44);
    out.set(pcm);
    return new Blob([buffer], { type: "audio/wav" });
  }

  /**
   * @param {{ _recordedPcm16?: Int16Array | null }} block
   */
  function hasRecordedPcm(block) {
    return block._recordedPcm16 instanceof Int16Array && block._recordedPcm16.length > 0;
  }

  /**
   * @param {{ _recordedPcm16?: Int16Array | null, _recordedPcmSampleRate?: number }} block
   */
  function recordedDurationSec(block) {
    if (!hasRecordedPcm(block)) return 0;
    const rate = block._recordedPcmSampleRate || REALTIME_SAMPLE_RATE;
    return block._recordedPcm16.length / rate;
  }

  /**
   * @param {object} block
   * @param {Int16Array} pcm
   * @param {number} [sampleRate]
   */
  function setRecordedPcm(block, pcm, sampleRate = REALTIME_SAMPLE_RATE) {
    block._recordedPcm16 = pcm;
    block._recordedPcmSampleRate = sampleRate;
  }

  /**
   * @param {object} block
   */
  function clearRecordedPcm(block) {
    delete block._recordedPcm16;
    delete block._recordedPcmSampleRate;
  }

  function canRecordMic() {
    const AC = global.AudioContext || global.webkitAudioContext;
    return !!(
      AC?.prototype &&
      typeof AC.prototype.createScriptProcessor === "function" &&
      global.navigator?.mediaDevices?.getUserMedia
    );
  }

  /**
   * @param {{ audioContext: AudioContext, onChunk?: (pcm: Int16Array) => void }} opts
   */
  async function startPcmRecording(opts) {
    if (!canRecordMic()) {
      throw new Error("Audio capture is not supported in this browser — use file upload (WAV/MP3).");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const audioContext = opts.audioContext;
    await audioContext.resume();

    /** @type {Int16Array[]} */
    const chunks = [];
    const resampler = createStreamingPcmResampler(audioContext.sampleRate);

    const processor = audioContext.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER, 1, 1);
    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const output = e.outputBuffer.getChannelData(0);
      output.fill(0);
      for (const pcm of resampler.push(input)) {
        chunks.push(pcm);
        if (typeof opts.onChunk === "function") opts.onChunk(pcm);
      }
    };

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(processor);
    processor.connect(audioContext.destination);

    return {
      stream,
      audioContext,
      processor,
      source,
      /** @returns {Promise<{ pcm: Int16Array, sampleRate: number, durationSec: number }>} */
      async stop() {
        processor.onaudioprocess = null;
        try {
          source.disconnect();
          processor.disconnect();
        } catch {
          /* ignore */
        }
        stream.getTracks().forEach((t) => t.stop());

        const tail = resampler.flush();
        if (tail.length > 0) chunks.push(tail);

        const pcm = mergePcmChunks(chunks);

        try {
          await audioContext.close();
        } catch {
          /* ignore */
        }

        return {
          pcm,
          sampleRate: REALTIME_SAMPLE_RATE,
          durationSec: pcm.length / REALTIME_SAMPLE_RATE,
        };
      },
    };
  }

  /**
   * @param {RTCDataChannel} dc
   * @param {Int16Array} pcm
   * @param {string} label
   * @param {{ sendText: (dc: RTCDataChannel, text: string) => void, maxBase64Chars?: number }} hooks
   */
  async function sendPcmToRealtimeDataChannel(dc, pcm, label, hooks) {
    if (!pcm || pcm.length < 1) {
      hooks.sendText(
        dc,
        `${label}\n(No recorded or uploaded audio in this browser session — record or choose a file before Run.)`,
      );
      return;
    }

    const durationSec = (pcm.length / REALTIME_SAMPLE_RATE).toFixed(1);
    const intro = `${label}\nUser audio: PCM 16-bit mono @ ${REALTIME_SAMPLE_RATE} Hz (${durationSec}s).`;

    if (pcm.length <= SINGLE_ITEM_MAX_SAMPLES) {
      const b64 = int16ToBase64(pcm);
      const maxChars = hooks.maxBase64Chars ?? 12_000_000;
      if (b64.length > maxChars) {
        throw new Error("Audio clip too large for Realtime.");
      }
      try {
        dc.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [
                { type: "input_text", text: intro },
                { type: "input_audio", audio: b64 },
              ],
            },
          }),
        );
      } catch {
        throw new Error("Could not send audio on Realtime data channel — try a shorter clip.");
      }
      return;
    }

    hooks.sendText(dc, `${intro}\n(Audio streamed via input_audio_buffer.)`);

    for (let i = 0; i < pcm.length; i += APPEND_CHUNK_SAMPLES) {
      const slice = pcm.subarray(i, Math.min(i + APPEND_CHUNK_SAMPLES, pcm.length));
      const b64 = int16ToBase64(slice);
      try {
        dc.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: b64,
          }),
        );
      } catch {
        throw new Error("Could not send audio chunk on Realtime data channel — try a shorter clip.");
      }
    }
    try {
      dc.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    } catch {
      throw new Error("Could not commit audio buffer on Realtime data channel.");
    }
  }

  global.workshopAudioCapture = {
    REALTIME_SAMPLE_RATE,
    canRecordMic,
    startPcmRecording,
    fileToPcm16,
    pcm16ToWavBlob,
    int16ToBase64,
    base64ToInt16,
    hasRecordedPcm,
    recordedDurationSec,
    setRecordedPcm,
    clearRecordedPcm,
    sendPcmToRealtimeDataChannel,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
