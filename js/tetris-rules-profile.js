(function attachTetrisRulesProfile(global) {
    'use strict';

    const fs = typeof require !== 'undefined' ? require('fs') : null;
    const path = typeof require !== 'undefined' ? require('path') : null;

    const DEFAULT_BUNDLE_RELATIVE = 'docs/tetris-rules-v1-parameter-bundle.json';

    /**
     * @param {string} profileId
     * @param {Record<string, unknown>} bundle
     * @returns {Record<string, unknown>|null}
     */
    function getProfileFromBundle(profileId, bundle) {
        if (!bundle || !bundle.profiles || typeof bundle.profiles !== 'object') {
            return null;
        }
        return bundle.profiles[profileId] || null;
    }

    /**
     * @param {string} [profileId]
     * @param {Record<string, unknown>} bundle
     * @returns {Record<string, unknown>|null}
     */
    function resolveProfile(profileId, bundle) {
        const id = profileId || bundle.recommendedProfileForMVP || 'classic_subset_v1';
        return getProfileFromBundle(id, bundle);
    }

    /**
     * @param {{ bundlePath?: string, bundle?: Record<string, unknown> }} [options]
     * @returns {Record<string, unknown>}
     */
    function loadRulesParameterBundle(options) {
        const opts = options || {};
        if (opts.bundle) {
            return opts.bundle;
        }
        if (!fs || !path) {
            throw new Error('loadRulesParameterBundle requires injected bundle in browser context');
        }
        const bundlePath = opts.bundlePath
            || path.join(__dirname, '..', DEFAULT_BUNDLE_RELATIVE);
        const raw = fs.readFileSync(bundlePath, 'utf8');
        return JSON.parse(raw);
    }

    /**
     * @param {Record<string, unknown>} profile
     * @returns {Record<string, unknown>|null}
     */
    function getRotationModel(profile) {
        if (!profile || !profile.rotationModel) {
            return null;
        }
        return profile.rotationModel;
    }

    /**
     * @param {Record<string, unknown>} profile
     * @returns {'genericOffsets'|'pieceSpecificTables'|null}
     */
    function getWallKickPolicy(profile) {
        const model = getRotationModel(profile);
        return model ? model.wallKickPolicy : null;
    }

    const api = {
        DEFAULT_BUNDLE_RELATIVE,
        loadRulesParameterBundle,
        getProfileFromBundle,
        resolveProfile,
        getRotationModel,
        getWallKickPolicy
    };

    global.TetrisRulesProfile = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
