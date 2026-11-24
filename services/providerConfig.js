// Preset local: no secrets, no implicit approval, no network requests.
export function getProviders(operation, env = process.env) {
    if (env.MEDAI_PROVIDER_POLICY_REVIEWED !== 'true') return [];
    let custom;
    try {
        custom = JSON.parse(env.MEDAI_PROVIDER_CONFIG || '{}');
        if (!custom || typeof custom !== 'object' || Array.isArray(custom)) return [];
    } catch { return []; }

    // Explicit configurations take precedence, including an empty operation list.
    let candidates = custom[operation];
    if (!Object.hasOwn(custom, operation) && operation === 'transcribe' &&
        env.MEDAI_GROQ_AUDIO_APPROVED === 'true') {
        candidates = [{
            kind: 'openai',
            url: 'https://api.groq.com/openai/v1/audio/transcriptions',
            tokenEnv: 'GROQ_API_KEY',
            model: 'whisper-large-v3',
            noTraining: true,
            rawAudioApproved: true
        }];
    }
    return Array.isArray(candidates) ? candidates.filter(p =>
        p && typeof p.url === 'string' && p.noTraining === true &&
        (!p.tokenEnv || !!env[p.tokenEnv]?.trim()) &&
        (operation !== 'transcribe' || p.rawAudioApproved === true)
    ) : [];
}
