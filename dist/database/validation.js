"use strict";
/**
 * BellePoule Modern - Database Validation Utilities
 * Input validation for database operations
 * Licensed under GPL-3.0
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeId = exports.sanitizeString = exports.validateSessionState = exports.validatePoolData = exports.validateMatchData = exports.validateFencerData = exports.validateCompetitionSettings = exports.validateCompetitionData = exports.validateArray = exports.validateOptionalEnum = exports.validateEnum = exports.validateOptionalDate = exports.validateDate = exports.validateOptionalNumber = exports.validateNumber = exports.validateOptionalString = exports.validateRequiredString = exports.validateId = exports.ValidationError = void 0;
const types_1 = require("../shared/types");
// ============================================================================
// Validation Error Class
// ============================================================================
class ValidationError extends Error {
    constructor(message, field) {
        super(message);
        this.field = field;
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
// ============================================================================
// Validation Utilities
// ============================================================================
const validateId = (id, fieldName = 'ID') => {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
        throw new ValidationError(`${fieldName} is required and must be a non-empty string`, fieldName);
    }
    if (id.length > 255) {
        throw new ValidationError(`${fieldName} cannot exceed 255 characters`, fieldName);
    }
};
exports.validateId = validateId;
const validateRequiredString = (value, fieldName, maxLength = 255) => {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
        throw new ValidationError(`${fieldName} is required and must be a non-empty string`, fieldName);
    }
    if (value.length > maxLength) {
        throw new ValidationError(`${fieldName} cannot exceed ${maxLength} characters`, fieldName);
    }
};
exports.validateRequiredString = validateRequiredString;
const validateOptionalString = (value, fieldName, maxLength = 255) => {
    if (value !== undefined && value !== null) {
        if (typeof value !== 'string') {
            throw new ValidationError(`${fieldName} must be a string`, fieldName);
        }
        if (value.length > maxLength) {
            throw new ValidationError(`${fieldName} cannot exceed ${maxLength} characters`, fieldName);
        }
    }
};
exports.validateOptionalString = validateOptionalString;
const validateNumber = (value, fieldName, min = 0, max) => {
    if (typeof value !== 'number' || isNaN(value)) {
        throw new ValidationError(`${fieldName} must be a valid number`, fieldName);
    }
    if (value < min) {
        throw new ValidationError(`${fieldName} must be at least ${min}`, fieldName);
    }
    if (max !== undefined && value > max) {
        throw new ValidationError(`${fieldName} cannot exceed ${max}`, fieldName);
    }
};
exports.validateNumber = validateNumber;
const validateOptionalNumber = (value, fieldName, min = 0, max) => {
    if (value !== undefined && value !== null) {
        (0, exports.validateNumber)(value, fieldName, min, max);
    }
};
exports.validateOptionalNumber = validateOptionalNumber;
const validateDate = (value, fieldName) => {
    if (!(value instanceof Date) || isNaN(value.getTime())) {
        throw new ValidationError(`${fieldName} must be a valid Date`, fieldName);
    }
};
exports.validateDate = validateDate;
const validateOptionalDate = (value, fieldName) => {
    if (value !== undefined && value !== null) {
        (0, exports.validateDate)(value, fieldName);
    }
};
exports.validateOptionalDate = validateOptionalDate;
const validateEnum = (value, fieldName, validValues) => {
    if (!validValues.includes(value)) {
        throw new ValidationError(`${fieldName} must be one of: ${validValues.join(', ')}`, fieldName);
    }
};
exports.validateEnum = validateEnum;
const validateOptionalEnum = (value, fieldName, validValues) => {
    if (value !== undefined && value !== null) {
        (0, exports.validateEnum)(value, fieldName, validValues);
    }
};
exports.validateOptionalEnum = validateOptionalEnum;
const validateArray = (value, fieldName, maxLength) => {
    if (!Array.isArray(value)) {
        throw new ValidationError(`${fieldName} must be an array`, fieldName);
    }
    if (maxLength !== undefined && value.length > maxLength) {
        throw new ValidationError(`${fieldName} cannot exceed ${maxLength} items`, fieldName);
    }
};
exports.validateArray = validateArray;
// ============================================================================
// Competition Validation
// ============================================================================
const validateCompetitionData = (data) => {
    // Required fields
    (0, exports.validateRequiredString)(data.title, 'title', 200);
    (0, exports.validateDate)(data.date, 'date');
    (0, exports.validateEnum)(data.weapon, 'weapon', Object.values(types_1.Weapon));
    (0, exports.validateEnum)(data.gender, 'gender', Object.values(types_1.Gender));
    (0, exports.validateEnum)(data.category, 'category', Object.values(types_1.Category));
    // Optional fields
    (0, exports.validateOptionalString)(data.shortTitle, 'shortTitle', 100);
    (0, exports.validateOptionalString)(data.location, 'location', 200);
    (0, exports.validateOptionalString)(data.organizer, 'organizer', 200);
    (0, exports.validateOptionalString)(data.organizerUrl, 'organizerUrl', 500);
    (0, exports.validateOptionalString)(data.color, 'color', 7); // Hex color
    // Validate URL format if provided
    if (data.organizerUrl) {
        try {
            new URL(data.organizerUrl);
        }
        catch {
            throw new ValidationError('organizerUrl must be a valid URL', 'organizerUrl');
        }
    }
    // Validate color format if provided
    if (data.color && !/^#[0-9A-Fa-f]{6}$/.test(data.color)) {
        throw new ValidationError('color must be a valid hex color (e.g., #FF0000)', 'color');
    }
    // Validate settings if provided
    if (data.settings) {
        (0, exports.validateCompetitionSettings)(data.settings);
    }
};
exports.validateCompetitionData = validateCompetitionData;
const validateCompetitionSettings = (settings) => {
    (0, exports.validateNumber)(settings.defaultPoolMaxScore, 'defaultPoolMaxScore', 1, 50);
    (0, exports.validateNumber)(settings.defaultTableMaxScore, 'defaultTableMaxScore', 1, 50);
    (0, exports.validateNumber)(settings.poolRounds, 'poolRounds', 1, 5);
    (0, exports.validateNumber)(settings.defaultRanking, 'defaultRanking', 0);
    (0, exports.validateNumber)(settings.minTeamSize, 'minTeamSize', 1);
    if (settings.defaultPoolMaxScore > 15) {
        throw new ValidationError('defaultPoolMaxScore should not exceed 15 for practical fencing', 'defaultPoolMaxScore');
    }
};
exports.validateCompetitionSettings = validateCompetitionSettings;
// ============================================================================
// Fencer Validation
// ============================================================================
const validateFencerData = (data) => {
    // Required fields
    (0, exports.validateNumber)(data.ref, 'ref', 1, 9999);
    (0, exports.validateRequiredString)(data.lastName, 'lastName', 100);
    (0, exports.validateRequiredString)(data.firstName, 'firstName', 100);
    (0, exports.validateEnum)(data.gender, 'gender', Object.values(types_1.Gender));
    (0, exports.validateEnum)(data.status, 'status', Object.values(types_1.FencerStatus));
    (0, exports.validateRequiredString)(data.nationality, 'nationality', 3); // ISO country code
    // Optional fields
    (0, exports.validateOptionalDate)(data.birthDate, 'birthDate');
    (0, exports.validateOptionalString)(data.league, 'league', 100);
    (0, exports.validateOptionalString)(data.club, 'club', 100);
    (0, exports.validateOptionalString)(data.license, 'license', 50);
    (0, exports.validateOptionalNumber)(data.ranking, 'ranking', 1);
    (0, exports.validateOptionalNumber)(data.seedNumber, 'seedNumber', 1);
    (0, exports.validateOptionalNumber)(data.initialRanking, 'initialRanking', 1);
    (0, exports.validateOptionalNumber)(data.finalRanking, 'finalRanking', 1);
    // Validate nationality format (ISO country code)
    if (data.nationality && !/^[A-Z]{2,3}$/.test(data.nationality)) {
        throw new ValidationError('nationality must be a valid ISO country code (2-3 letters)', 'nationality');
    }
    // Validate birth date if provided (not in future)
    if (data.birthDate && data.birthDate > new Date()) {
        throw new ValidationError('birthDate cannot be in the future', 'birthDate');
    }
};
exports.validateFencerData = validateFencerData;
// ============================================================================
// Match Validation
// ============================================================================
const validateMatchData = (data) => {
    // Required fields
    (0, exports.validateNumber)(data.number, 'number', 1);
    (0, exports.validateEnum)(data.status, 'status', Object.values(types_1.MatchStatus));
    (0, exports.validateNumber)(data.maxScore, 'maxScore', 1, 50);
    // Optional fields
    (0, exports.validateOptionalNumber)(data.strip, 'strip', 1, 99);
    (0, exports.validateOptionalNumber)(data.duration, 'duration', 0);
    (0, exports.validateOptionalNumber)(data.round, 'round', 1);
    (0, exports.validateOptionalNumber)(data.position, 'position', 1);
    // Validate date fields
    (0, exports.validateOptionalDate)(data.startTime, 'startTime');
    (0, exports.validateOptionalDate)(data.endTime, 'endTime');
    // Validate time consistency
    if (data.startTime && data.endTime && data.endTime <= data.startTime) {
        throw new ValidationError('endTime must be after startTime', 'endTime');
    }
    // Validate duration consistency with start/end times
    if (data.duration && data.startTime && data.endTime) {
        const expectedDuration = Math.floor((data.endTime.getTime() - data.startTime.getTime()) / 1000);
        if (Math.abs(data.duration - expectedDuration) > 60) { // Allow 1 minute tolerance
            throw new ValidationError('duration does not match start/end time difference', 'duration');
        }
    }
};
exports.validateMatchData = validateMatchData;
// ============================================================================
// Pool Validation
// ============================================================================
const validatePoolData = (data) => {
    // Required fields
    (0, exports.validateNumber)(data.number, 'number', 1);
    (0, exports.validateId)(data.phaseId, 'phaseId');
    // Optional fields
    (0, exports.validateOptionalNumber)(data.strip, 'strip', 1, 99);
    (0, exports.validateOptionalDate)(data.startTime, 'startTime');
    // Validate fencers array if provided
    if (data.fencers !== undefined) {
        (0, exports.validateArray)(data.fencers, 'fencers', 20); // Max 20 fencers per pool for practical reasons
        data.fencers.forEach((fencer, index) => {
            if (!fencer || !fencer.id) {
                throw new ValidationError(`Fencer at index ${index} is invalid`, 'fencers');
            }
        });
    }
    // Validate matches array if provided
    if (data.matches !== undefined) {
        (0, exports.validateArray)(data.matches, 'matches');
        data.matches.forEach((match, index) => {
            if (!match || !match.id) {
                throw new ValidationError(`Match at index ${index} is invalid`, 'matches');
            }
        });
    }
};
exports.validatePoolData = validatePoolData;
// ============================================================================
// Session State Validation
// ============================================================================
const validateSessionState = (state) => {
    if (!state || typeof state !== 'object') {
        throw new ValidationError('Session state must be an object');
    }
    // Validate specific fields if present
    if (state.currentPhase !== undefined) {
        (0, exports.validateNumber)(state.currentPhase, 'currentPhase', 0);
    }
    if (state.selectedPool !== undefined) {
        (0, exports.validateId)(state.selectedPool, 'selectedPool');
    }
    if (state.selectedTable !== undefined) {
        (0, exports.validateId)(state.selectedTable, 'selectedTable');
    }
    if (state.lastSaveTime !== undefined) {
        (0, exports.validateDate)(state.lastSaveTime, 'lastSaveTime');
    }
    // Validate uiState if present
    if (state.uiState !== undefined && typeof state.uiState !== 'object') {
        throw new ValidationError('uiState must be an object');
    }
};
exports.validateSessionState = validateSessionState;
// ============================================================================
// Input Sanitization
// ============================================================================
const sanitizeString = (value) => {
    return value.trim().replace(/[&<>"']/g, (char) => {
        const entities = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return entities[char] || char;
    });
};
exports.sanitizeString = sanitizeString;
const sanitizeId = (value) => {
    return (0, exports.sanitizeString)(value).replace(/[^a-zA-Z0-9_-]/g, ''); // Keep only safe characters
};
exports.sanitizeId = sanitizeId;
//# sourceMappingURL=validation.js.map