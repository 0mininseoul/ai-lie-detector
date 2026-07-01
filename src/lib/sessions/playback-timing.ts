type RecordingTiming = {
  r2_key: string;
  target_start_ms: number;
  target_end_ms: number;
};

type TargetSegmentTiming = {
  r2_key: string;
  duration_ms: number;
};

const fullRecordingDurationSlackMs = 750;

export function targetSegmentUsesRecordingOffsets({
  recording,
  targetSegment
}: {
  recording: RecordingTiming | null;
  targetSegment: TargetSegmentTiming | null;
}) {
  if (!recording || !targetSegment) return false;

  const targetWindowDurationMs = Math.max(1, recording.target_end_ms - recording.target_start_ms);
  return targetSegment.duration_ms > targetWindowDurationMs + fullRecordingDurationSlackMs;
}

export function resolveTargetPlaybackTiming({
  recording,
  targetSegment
}: {
  recording: RecordingTiming | null;
  targetSegment: TargetSegmentTiming | null;
}) {
  if (targetSegmentUsesRecordingOffsets({ recording, targetSegment })) {
    return {
      targetStartMs: recording?.target_start_ms ?? 0,
      targetEndMs: recording?.target_end_ms ?? targetSegment?.duration_ms ?? 0
    };
  }

  if (targetSegment) {
    return {
      targetStartMs: 0,
      targetEndMs: targetSegment.duration_ms
    };
  }

  if (recording) {
    return {
      targetStartMs: recording.target_start_ms,
      targetEndMs: recording.target_end_ms
    };
  }

  return null;
}
