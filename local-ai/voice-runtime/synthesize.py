"""One request per process, using only mlx-speech's public model and audio APIs."""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import sys
import wave


def checked_file(path, entry):
    if not path.is_file() or path.stat().st_size != entry["bytes"]:
        raise ValueError("Local model/reference file size does not match the pinned manifest")
    with path.open("rb") as source:
        actual = hashlib.file_digest(source, "sha256").hexdigest()
    if actual != entry["sha256"]:
        raise ValueError("Local model/reference checksum does not match the pinned manifest")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    args = parser.parse_args()
    input_path = Path(args.input)
    if not input_path.is_absolute() or input_path.stat().st_size > 16384:
        raise ValueError("Invalid input file")
    request = json.loads(input_path.read_text())
    if set(request) != {"text", "modelDir", "referenceAudio", "referenceText", "outputDir"}:
        raise ValueError("Invalid request fields")
    text = request["text"]
    if not isinstance(text, str) or not text.strip() or len(text) > 300:
        raise ValueError("Text must contain 1-300 characters")
    root = Path(__file__).resolve().parent
    model_dir = Path(request["modelDir"])
    reference = Path(request["referenceAudio"])
    output_dir = Path(request["outputDir"])
    if not all(p.is_absolute() for p in [model_dir, reference, output_dir]) or output_dir.resolve() != input_path.parent.resolve():
        raise ValueError("Invalid local paths")
    manifest = json.loads((root / "model-manifest.json").read_text())
    for entry in manifest["files"]:
        checked_file(model_dir / entry["file"], entry)
    reference_info = json.loads((root / "reference.json").read_text())
    checked_file(reference, reference_info)
    if request["referenceText"] != reference_info["text"]:
        raise ValueError("Reference transcript does not match the pinned official example")
    if importlib.metadata.version("mlx-speech") != "0.5.2":
        raise ValueError("Expected mlx-speech 0.5.2")

    # No aliases, downloading, global plug-ins, shell execution, or remote provider.
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    from mlx_speech.generation import StepAudioEditXModel
    from mlx_speech.audio import load_audio
    import numpy as np

    prompt_audio, prompt_sample_rate = load_audio(reference)
    prompt_audio = np.asarray(prompt_audio, dtype=np.float32)
    if prompt_audio.ndim != 1 or not np.isfinite(prompt_audio).all() or not 0 < prompt_audio.size / prompt_sample_rate <= 30:
        raise ValueError("Invalid reference waveform")
    model = StepAudioEditXModel.from_dir(model_dir)
    result = model.clone(prompt_audio, prompt_sample_rate, request["referenceText"], text,
                         max_new_tokens=4096, temperature=0.7, seed=42, flow_steps=10)
    metadata = {"stop_reached": result.stop_reached, "stop_reason": result.stop_reason,
                "generated_audio_tokens": len(result.generated_token_ids)}
    (output_dir / "result.json").write_text(json.dumps(metadata))
    if result.stop_reached is not True or result.stop_reason != "eos":
        return  # Node rejects a truncated result, without ever exposing its audio.
    waveform = np.asarray(result.waveform, dtype=np.float32)
    if result.sample_rate != 24000 or waveform.ndim != 1 or not 0 < waveform.size <= 24000 * 45 or not np.isfinite(waveform).all():
        raise ValueError("Invalid output waveform")
    # PCM16 encoding is the only project-specific audio transformation.
    pcm = (np.clip(waveform, -1, 1) * 32767).round().astype("<i2").tobytes()
    with wave.open(str(output_dir / "output.wav"), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(24000)
        output.writeframes(pcm)
    os.chmod(output_dir / "output.wav", 0o600)
    os.chmod(output_dir / "result.json", 0o600)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Never return input text, file paths or library exception details to callers.
        print(f"StepAudio runtime failed ({type(error).__name__})", file=sys.stderr)
        sys.exit(1)
