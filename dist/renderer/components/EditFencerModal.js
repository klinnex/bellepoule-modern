"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * BellePoule Modern - Edit Fencer Modal Component
 * Licensed under GPL-3.0
 */
const react_1 = require("react");
const types_1 = require("../../shared/types");
const EditFencerModal = ({ fencer, onSave, onClose }) => {
    const [lastName, setLastName] = (0, react_1.useState)(fencer.lastName);
    const [firstName, setFirstName] = (0, react_1.useState)(fencer.firstName);
    const [gender, setGender] = (0, react_1.useState)(fencer.gender);
    const [club, setClub] = (0, react_1.useState)(fencer.club || '');
    const [league, setLeague] = (0, react_1.useState)(fencer.league || '');
    const [nationality, setNationality] = (0, react_1.useState)(fencer.nationality || 'FRA');
    const [license, setLicense] = (0, react_1.useState)(fencer.license || '');
    const [ranking, setRanking] = (0, react_1.useState)(fencer.ranking?.toString() || '');
    const [status, setStatus] = (0, react_1.useState)(fencer.status);
    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(fencer.id, {
            lastName: lastName.toUpperCase(),
            firstName,
            gender,
            club: club || undefined,
            league: league || undefined,
            nationality,
            license: license || undefined,
            ranking: ranking ? parseInt(ranking) : undefined,
            status,
        });
        onClose();
    };
    return ((0, jsx_runtime_1.jsx)("div", { className: "modal-overlay", onClick: onClose, children: (0, jsx_runtime_1.jsxs)("div", { className: "modal", onClick: e => e.stopPropagation(), style: { maxWidth: '500px' }, children: [(0, jsx_runtime_1.jsxs)("div", { className: "modal-header", children: [(0, jsx_runtime_1.jsx)("h2", { children: "Modifier le tireur" }), (0, jsx_runtime_1.jsx)("button", { className: "btn-close", onClick: onClose, children: "\u00D7" })] }), (0, jsx_runtime_1.jsxs)("form", { onSubmit: handleSubmit, className: "modal-body", children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }, children: [(0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { className: "form-label", children: "Nom *" }), (0, jsx_runtime_1.jsx)("input", { type: "text", className: "form-input", value: lastName, onChange: e => setLastName(e.target.value), required: true })] }), (0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { className: "form-label", children: "Pr\u00E9nom *" }), (0, jsx_runtime_1.jsx)("input", { type: "text", className: "form-input", value: firstName, onChange: e => setFirstName(e.target.value), required: true })] })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }, children: [(0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { className: "form-label", children: "Sexe" }), (0, jsx_runtime_1.jsxs)("select", { className: "form-input form-select", value: gender, onChange: e => setGender(e.target.value), children: [(0, jsx_runtime_1.jsx)("option", { value: types_1.Gender.MALE, children: "Homme" }), (0, jsx_runtime_1.jsx)("option", { value: types_1.Gender.FEMALE, children: "Femme" }), (0, jsx_runtime_1.jsx)("option", { value: types_1.Gender.MIXED, children: "Mixte" })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { className: "form-label", children: "Statut" }), (0, jsx_runtime_1.jsxs)("select", { className: "form-input form-select", value: status, onChange: e => setStatus(e.target.value), children: [(0, jsx_runtime_1.jsx)("option", { value: types_1.FencerStatus.NOT_CHECKED_IN, children: "Non point\u00E9" }), (0, jsx_runtime_1.jsx)("option", { value: types_1.FencerStatus.CHECKED_IN, children: "Point\u00E9 (pr\u00E9sent)" }), (0, jsx_runtime_1.jsx)("option", { value: types_1.FencerStatus.FORFAIT, children: "Forfait" }), (0, jsx_runtime_1.jsx)("option", { value: types_1.FencerStatus.ABANDONED, children: "Abandon" }), (0, jsx_runtime_1.jsx)("option", { value: types_1.FencerStatus.EXCLUDED, children: "Exclu" })] })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { className: "form-label", children: "Club" }), (0, jsx_runtime_1.jsx)("input", { type: "text", className: "form-input", value: club, onChange: e => setClub(e.target.value), placeholder: "Ex: CE Melun" })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }, children: [(0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { className: "form-label", children: "Ligue" }), (0, jsx_runtime_1.jsx)("input", { type: "text", className: "form-input", value: league, onChange: e => setLeague(e.target.value), placeholder: "Ex: IDF" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { className: "form-label", children: "Nationalit\u00E9" }), (0, jsx_runtime_1.jsx)("input", { type: "text", className: "form-input", value: nationality, onChange: e => setNationality(e.target.value.toUpperCase()), maxLength: 3, placeholder: "FRA" })] })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }, children: [(0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { className: "form-label", children: "N\u00B0 Licence" }), (0, jsx_runtime_1.jsx)("input", { type: "text", className: "form-input", value: license, onChange: e => setLicense(e.target.value) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { className: "form-label", children: "Classement" }), (0, jsx_runtime_1.jsx)("input", { type: "number", className: "form-input", value: ranking, onChange: e => setRanking(e.target.value), min: "1", placeholder: "Non class\u00E9" })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "modal-footer", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: "btn btn-secondary", onClick: onClose, children: "Annuler" }), (0, jsx_runtime_1.jsx)("button", { type: "submit", className: "btn btn-primary", children: "Enregistrer" })] })] })] }) }));
};
exports.default = EditFencerModal;
//# sourceMappingURL=EditFencerModal.js.map