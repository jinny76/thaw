import { describe, it, expect } from 'vitest';
import { isContentFrame, CONTENT_FRAME_TYPES } from './protocol.js';
import { DEFAULT_TTL_SECONDS, CHUNK_SIZE, ROOM_ID_LENGTH } from './constants.js';

describe('shared protocol', () => {
  it('classifies content frames correctly', () => {
    expect(isContentFrame('msg')).toBe(true);
    expect(isContentFrame('media_chunk')).toBe(true);
    expect(isContentFrame('ecdh_pub')).toBe(true);
    expect(isContentFrame('create_room')).toBe(false);
    expect(isContentFrame('join_room')).toBe(false);
    expect(isContentFrame('room_state')).toBe(false);
  });

  it('exposes a stable content-frame set', () => {
    expect(CONTENT_FRAME_TYPES.has('msg')).toBe(true);
    expect(CONTENT_FRAME_TYPES.size).toBeGreaterThan(0);
  });

  it('exposes sane constants', () => {
    expect(DEFAULT_TTL_SECONDS).toBe(300);
    expect(CHUNK_SIZE).toBe(65536);
    expect(ROOM_ID_LENGTH).toBe(9);
  });
});
