"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * BellePoule Modern - Add Fencer Modal
 * Licensed under GPL-3.0
 */
const react_1 = __importStar(require("react"));
const types_1 = require("../../shared/types");
const Toast_1 = require("./Toast");
const AddFencerModal = ({ onClose, onAdd }) => {
    const { showToast } = (0, Toast_1.useToast)();
    const [lastName, setLastName] = (0, react_1.useState)('');
    const [firstName, setFirstName] = (0, react_1.useState)('');
    const [club, setClub] = (0, react_1.useState)('');
    const [league, setLeague] = (0, react_1.useState)('');
    const [license, setLicense] = (0, react_1.useState)('');
    const [ranking, setRanking] = (0, react_1.useState)('');
    const [gender, setGender] = (0, react_1.useState)(types_1.Gender.MALE);
    const [nationality, setNationality] = (0, react_1.useState)('FRA');
    const handleSubmit = (e) => {
        e.preventDefault();
        if (!lastName.trim() || !firstName.trim()) {
            showToast('Le nom et le prénom sont obligatoires', 'warning');
            return;
        }
        onAdd({
            lastName: lastName.trim().toUpperCase(),
            firstName: firstName.trim(),
            club: club.trim() || undefined,
            league: league.trim() || undefined,
            license: license.trim() || undefined,
            ranking: ranking ? parseInt(ranking, 10) : undefined,
            gender,
            nationality,
            status: types_1.FencerStatus.NOT_CHECKED_IN,
        });
    };
    return ((0, jsx_runtime_1.jsx)("div", { className: "modal-overlay", onClick: onClose, children: (0, jsx_runtime_1.jsxs)("div", { className: "modal", onClick: (e) => e.stopPropagation(), children: [(0, jsx_runtime_1.jsxs)("div", { className: "modal-header", children: [(0, jsx_runtime_1.jsx)("h2", { className: "modal-title", children: "Ajouter un tireur" }), (0, jsx_runtime_1.jsx)("button", { className: "btn btn-icon btn-secondary", onClick: onClose, style: { padding: '0.25rem' }, children: "\u2715" })] }), (0, jsx_runtime_1.jsxs)("form", { onSubmit: handleSubmit, children: [(0, jsx_runtime_1.jsxs)("div", { className: "modal-body", children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }, children: [(0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { className: "form-label", children: "Nom *" }), (0, jsx_runtime_1.jsx)("input", { type: "text", className: "form-input", placeholder: "DUPONT", value: lastName, onChange: (e) => setLastName(e.target.value), required: true, autoFocus: true })] }), (0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { className: "form-label", children: "Pr\u00E9nom *" }), (0, jsx_runtime_1.jsx)("input", { type: "text", className: "form-input", placeholder: "Jean", value: firstName, onChange: (e) => setFirstName(e.target.value), required: true })] })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }, children: [(0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { className: "form-label", children: "Sexe" }), (0, jsx_runtime_1.jsxs)("select", { className: "form-input form-select", value: gender, onChange: (e) => setGender(e.target.value), children: [(0, jsx_runtime_1.jsx)("option", { value: types_1.Gender.MALE, children: "Masculin" }), (0, jsx_runtime_1.jsx)("option", { value: types_1.Gender.FEMALE, children: "F\u00E9minin" })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { className: "form-label", children: "Nationalit\u00E9" }), (0, jsx_runtime_1.jsx)("input", { type: "text", className: "form-input", placeholder: "FRA", value: nationality, onChange: (e) => setNationality(e.target.value.toUpperCase()), maxLength: 3 })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { className: "form-label", children: "Club" }), (0, jsx_runtime_1.jsx)("input", { type: "text", className: "form-input", placeholder: "PARIS USM", value: club, onChange: (e) => setClub(e.target.value) })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }, children: [(0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { className: "form-label", children: "Ligue" }), (0, jsx_runtime_1.jsx)("input", { type: "text", className: "form-input", placeholder: "\u00CEle-de-France", value: league, onChange: (e) => setLeague(e.target.value) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { className: "form-label", children: "Licence" }), (0, jsx_runtime_1.jsx)("input", { type: "text", className: "form-input", placeholder: "123456789", value: license, onChange: (e) => setLicense(e.target.value) })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { className: "form-label", children: "Classement" }), (0, jsx_runtime_1.jsx)("input", { type: "number", className: "form-input", placeholder: "1000", value: ranking, onChange: (e) => setRanking(e.target.value), min: "1" })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "modal-footer", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: "btn btn-secondary", onClick: onClose, children: "Annuler" }), (0, jsx_runtime_1.jsx)("button", { type: "submit", className: "btn btn-primary", children: "Ajouter le tireur" })] })] })] }) }));
};
exports.default = AddFencerModal;
//# sourceMappingURL=AddFencerModal.js.map