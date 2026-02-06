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
 * BellePoule Modern - New Competition Modal
 * Licensed under GPL-3.0
 */
const react_1 = __importStar(require("react"));
const types_1 = require("../../shared/types");
const useTranslation_1 = require("../hooks/useTranslation");
const NewCompetitionModal = ({ onClose, onCreate }) => {
    const { t } = (0, useTranslation_1.useTranslation)();
    const [title, setTitle] = (0, react_1.useState)('');
    const [date, setDate] = (0, react_1.useState)(new Date().toISOString().split('T')[0]);
    const [weapon, setWeapon] = (0, react_1.useState)(types_1.Weapon.EPEE);
    const [gender, setGender] = (0, react_1.useState)(types_1.Gender.MALE);
    const [category, setCategory] = (0, react_1.useState)(types_1.Category.SENIOR);
    const [location, setLocation] = (0, react_1.useState)('');
    const handleSubmit = (e) => {
        e.preventDefault();
        onCreate({
            title: title || `Compétition du ${new Date(date).toLocaleDateString('fr-FR')}`,
            date: new Date(date),
            weapon,
            gender,
            category,
            location,
            color: getRandomColor(),
        });
    };
    const getRandomColor = () => {
        const colors = [
            '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
            '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    };
    return ((0, jsx_runtime_1.jsx)("div", { className: "modal-overlay", onClick: onClose, children: (0, jsx_runtime_1.jsxs)("div", { className: "modal", onClick: (e) => e.stopPropagation(), children: [(0, jsx_runtime_1.jsxs)("div", { className: "modal-header", children: [(0, jsx_runtime_1.jsx)("h2", { className: "modal-title", children: t('competition.new') }), (0, jsx_runtime_1.jsx)("button", { className: "btn btn-icon btn-secondary", onClick: onClose, style: { padding: '0.25rem' }, children: "\u2715" })] }), (0, jsx_runtime_1.jsxs)("form", { onSubmit: handleSubmit, children: [(0, jsx_runtime_1.jsxs)("div", { className: "modal-body", children: [(0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { className: "form-label", children: t('competition.title') }), (0, jsx_runtime_1.jsx)("input", { type: "text", className: "form-input", placeholder: "Ex: Championnat R\u00E9gional", value: title, onChange: (e) => setTitle(e.target.value) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { className: "form-label", children: t('competition.date') }), (0, jsx_runtime_1.jsx)("input", { type: "date", className: "form-input", value: date, onChange: (e) => setDate(e.target.value), required: true })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }, children: [(0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { className: "form-label", children: t('competition.weapon') }), (0, jsx_runtime_1.jsxs)("select", { className: "form-input form-select", value: weapon, onChange: (e) => setWeapon(e.target.value), children: [(0, jsx_runtime_1.jsx)("option", { value: types_1.Weapon.EPEE, children: t('weapons.epee') }), (0, jsx_runtime_1.jsx)("option", { value: types_1.Weapon.FOIL, children: t('weapons.foil') }), (0, jsx_runtime_1.jsx)("option", { value: types_1.Weapon.SABRE, children: t('weapons.sabre') }), (0, jsx_runtime_1.jsx)("option", { value: types_1.Weapon.LASER, children: t('weapons.laser') })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { className: "form-label", children: t('competition.gender') }), (0, jsx_runtime_1.jsxs)("select", { className: "form-input form-select", value: gender, onChange: (e) => setGender(e.target.value), children: [(0, jsx_runtime_1.jsx)("option", { value: types_1.Gender.MALE, children: t('genders.male') }), (0, jsx_runtime_1.jsx)("option", { value: types_1.Gender.FEMALE, children: t('genders.female') }), (0, jsx_runtime_1.jsx)("option", { value: types_1.Gender.MIXED, children: t('genders.mixed') })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { className: "form-label", children: t('competition.category') }), (0, jsx_runtime_1.jsxs)("select", { className: "form-input form-select", value: category, onChange: (e) => setCategory(e.target.value), children: [(0, jsx_runtime_1.jsxs)("option", { value: types_1.Category.U11, children: [t('categories.U11'), " (", t('categories.U11'), ")"] }), (0, jsx_runtime_1.jsxs)("option", { value: types_1.Category.U13, children: [t('categories.U13'), " (", t('categories.U13'), ")"] }), (0, jsx_runtime_1.jsxs)("option", { value: types_1.Category.U15, children: [t('categories.U15'), " (", t('categories.U15'), ")"] }), (0, jsx_runtime_1.jsxs)("option", { value: types_1.Category.U17, children: [t('categories.U17'), " (", t('categories.U17'), ")"] }), (0, jsx_runtime_1.jsxs)("option", { value: types_1.Category.U20, children: [t('categories.U20'), " (", t('categories.U20'), ")"] }), (0, jsx_runtime_1.jsx)("option", { value: types_1.Category.SENIOR, children: t('categories.senior') }), (0, jsx_runtime_1.jsxs)("option", { value: types_1.Category.V1, children: [t('categories.V1'), " (40-49)"] }), (0, jsx_runtime_1.jsxs)("option", { value: types_1.Category.V2, children: [t('categories.V2'), " (50-59)"] }), (0, jsx_runtime_1.jsxs)("option", { value: types_1.Category.V3, children: [t('categories.V3'), " (60-69)"] }), (0, jsx_runtime_1.jsxs)("option", { value: types_1.Category.V4, children: [t('categories.V4'), " (70+)"] })] })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsxs)("label", { className: "form-label", children: [t('competition.location'), " (", t('actions.default'), ")"] }), (0, jsx_runtime_1.jsx)("input", { type: "text", className: "form-input", placeholder: `Ex: Gymnase Jean Moulin, Paris`, value: location, onChange: (e) => setLocation(e.target.value) })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "modal-footer", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: "btn btn-secondary", onClick: onClose, children: t('actions.cancel') }), (0, jsx_runtime_1.jsxs)("button", { type: "submit", className: "btn btn-primary", children: [t('actions.add'), " ", t('competition.title').toLowerCase()] })] })] })] }) }));
};
exports.default = NewCompetitionModal;
//# sourceMappingURL=NewCompetitionModal.js.map