//! IPC accepts only the canonical WAV produced by recorder.ts, not arbitrary files.
pub const MAX_SECONDS: usize = 120;
const MAX_DATA: usize = 16_000 * 2 * MAX_SECONDS;

pub fn validate(wav: &[u8]) -> Result<(), String> {
    // Check bounds before reading any header offset or launching a native decoder.
    if wav.len() < 46 || wav.len() > 44 + MAX_DATA {
        return Err("ASR: нужна непустая WAV-запись длительностью до 120 секунд".into());
    }
    let u16_at = |at| u16::from_le_bytes([wav[at], wav[at + 1]]);
    let u32_at = |at| u32::from_le_bytes([wav[at], wav[at + 1], wav[at + 2], wav[at + 3]]);
    if &wav[0..4] != b"RIFF"
        || &wav[8..12] != b"WAVE"
        || &wav[12..16] != b"fmt "
        || &wav[36..40] != b"data"
        || u32_at(16) != 16
    {
        return Err("ASR: ожидается стандартный WAV с fmt и data без дополнительных блоков".into());
    }
    if u16_at(20) != 1
        || u16_at(22) != 1
        || u32_at(24) != 16_000
        || u32_at(28) != 32_000
        || u16_at(32) != 2
        || u16_at(34) != 16
    {
        return Err("ASR: нужен PCM WAV, моно, 16 бит, 16000 Гц".into());
    }
    let data = wav.len() - 44;
    if data & 1 != 0 || u32_at(4) as usize != wav.len() - 8 || u32_at(40) as usize != data {
        return Err("ASR: длина WAV не совпадает с заголовком или запись оборвана".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    pub fn fixture(samples: usize) -> Vec<u8> {
        let mut wav = vec![0; 44 + samples * 2];
        wav[0..4].copy_from_slice(b"RIFF");
        let riff = (wav.len() - 8) as u32;
        wav[4..8].copy_from_slice(&riff.to_le_bytes());
        wav[8..16].copy_from_slice(b"WAVEfmt ");
        wav[16..20].copy_from_slice(&16u32.to_le_bytes());
        wav[20..22].copy_from_slice(&1u16.to_le_bytes());
        wav[22..24].copy_from_slice(&1u16.to_le_bytes());
        wav[24..28].copy_from_slice(&16000u32.to_le_bytes());
        wav[28..32].copy_from_slice(&32000u32.to_le_bytes());
        wav[32..34].copy_from_slice(&2u16.to_le_bytes());
        wav[34..36].copy_from_slice(&16u16.to_le_bytes());
        wav[36..40].copy_from_slice(b"data");
        wav[40..44].copy_from_slice(&((samples * 2) as u32).to_le_bytes());
        wav
    }

    #[test]
    fn accepts_own_pcm_format_and_duration_boundary() {
        assert!(validate(&fixture(1)).is_ok());
        assert!(validate(&fixture(16000 * MAX_SECONDS)).is_ok());
        assert!(validate(&fixture(0)).is_err());
        assert!(validate(&fixture(16000 * MAX_SECONDS + 1)).is_err());
    }

    #[test]
    fn rejects_truncation_at_every_header_offset_without_panicking() {
        let wav = fixture(10);
        for end in 0..wav.len() {
            assert!(validate(&wav[..end]).is_err(), "offset {end}");
        }
    }

    #[test]
    fn rejects_format_substitution_lengths_and_trailing_data() {
        let wav = fixture(10);
        for offset in [0, 4, 8, 12, 16, 20, 22, 24, 28, 32, 34, 36, 40] {
            let mut altered = wav.clone();
            altered[offset] ^= 0xff;
            assert!(validate(&altered).is_err(), "offset {offset}");
        }
        let mut extra = wav.clone();
        extra.extend_from_slice(b"RIFF");
        assert!(validate(&extra).is_err());
        let mut odd = wav;
        odd.push(0);
        let length = odd.len();
        odd[4..8].copy_from_slice(&((length - 8) as u32).to_le_bytes());
        odd[40..44].copy_from_slice(&((length - 44) as u32).to_le_bytes());
        assert!(validate(&odd).is_err());
    }
}
