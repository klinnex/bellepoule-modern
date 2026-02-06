"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * BellePoule Modern - Fencer List Component
 * Licensed under GPL-3.0
 */
const react_1 = require("react");
const types_1 = require("../../shared/types");
const EditFencerModal_1 = __importDefault(require("./EditFencerModal"));
const useTranslation_1 = require("../hooks/useTranslation");
const FencerList = ({ fencers, onCheckIn, onAddFencer, onEditFencer, onDeleteFencer, onCheckInAll, onUncheckAll, onSetFencerStatus }) => {
    const { t } = (0, useTranslation_1.useTranslation)();
    const statusLabels = {
        [types_1.FencerStatus.CHECKED_IN]: { label: t('status.checked_in'), color: 'badge-success' },
        [types_1.FencerStatus.NOT_CHECKED_IN]: { label: t('status.not_checked_in'), color: 'badge-warning' },
        [types_1.FencerStatus.QUALIFIED]: { label: t('status.qualified'), color: 'badge-success' },
        [types_1.FencerStatus.ELIMINATED]: { label: t('status.eliminated'), color: 'badge-danger' },
        [types_1.FencerStatus.ABANDONED]: { label: t('status.abandoned'), color: 'badge-danger' },
        [types_1.FencerStatus.EXCLUDED]: { label: t('status.excluded'), color: 'badge-danger' },
        [types_1.FencerStatus.FORFAIT]: { label: t('status.forfeit'), color: 'badge-danger' },
    };
    const [searchTerm, setSearchTerm] = (0, react_1.useState)('');
    const [sortBy, setSortBy] = (0, react_1.useState)('ranking');
    const [editingFencer, setEditingFencer] = (0, react_1.useState)(null);
    const filteredFencers = fencers
        .filter(f => {
        const search = searchTerm.toLowerCase();
        return (f.lastName.toLowerCase().includes(search) ||
            f.firstName.toLowerCase().includes(search) ||
            f.club?.toLowerCase().includes(search));
    })
        .sort((a, b) => {
        switch (sortBy) {
            case 'name': return a.lastName.localeCompare(b.lastName);
            case 'club': return (a.club || '').localeCompare(b.club || '');
            case 'ranking': return (a.ranking ?? 99999) - (b.ranking ?? 99999);
            case 'age': return (a.birthDate?.getTime() ?? 0) - (b.birthDate?.getTime() ?? 0);
            default: return 0;
        }
    });
    const checkedInCount = fencers.filter(f => f.status === types_1.FencerStatus.CHECKED_IN).length;
    const notCheckedInCount = fencers.filter(f => f.status === types_1.FencerStatus.NOT_CHECKED_IN).length;
    const handleEditSave = (id, updates) => {
        if (onEditFencer) {
            onEditFencer(id, updates);
        }
        setEditingFencer(null);
    };
    const handleDeleteFencer = (id) => {
        if (window.confirm(t('messages.confirm_delete_fencer'))) {
            if (onDeleteFencer) {
                onDeleteFencer(id);
            }
        }
    };
    const handleSetFencerStatus = (id, status, confirmationMessage) => {
        if (confirmationMessage) {
            if (window.confirm(confirmationMessage)) {
                if (onSetFencerStatus) {
                    onSetFencerStatus(id, status);
                }
            }
        }
        else {
            if (onSetFencerStatus) {
                onSetFencerStatus(id, status);
            }
        }
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "content", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex justify-between items-center mb-4", children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h2", { style: { fontSize: '1.25rem', fontWeight: '600' }, children: t('fencer.add') }), (0, jsx_runtime_1.jsxs)("p", { className: "text-sm text-muted", children: [checkedInCount, " / ", fencers.length, " ", t('fencer.points').toLowerCase()] })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: '0.5rem' }, children: [notCheckedInCount > 0 && onCheckInAll && ((0, jsx_runtime_1.jsxs)("button", { className: "btn btn-secondary", onClick: onCheckInAll, title: `Pointer les ${notCheckedInCount} tireurs non pointés`, children: ["\u2713 ", t('actions.check_in_all')] })), checkedInCount > 0 && onUncheckAll && ((0, jsx_runtime_1.jsxs)("button", { className: "btn btn-secondary", onClick: onUncheckAll, title: t('fencer.uncheck_all'), children: ["\u2717 ", t('actions.uncheck_all')] })), (0, jsx_runtime_1.jsxs)("button", { className: "btn btn-primary", onClick: onAddFencer, children: ["+ ", t('fencer.add')] })] })] }), (0, jsx_runtime_1.jsx)("div", { className: "card mb-4", children: (0, jsx_runtime_1.jsxs)("div", { className: "card-body flex gap-4", children: [(0, jsx_runtime_1.jsx)("input", { type: "text", className: "form-input", style: { flex: 1 }, placeholder: "Rechercher...", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value) }), (0, jsx_runtime_1.jsxs)("select", { className: "form-input form-select", style: { width: '200px' }, value: sortBy, onChange: (e) => setSortBy(e.target.value), children: [(0, jsx_runtime_1.jsx)("option", { value: "ranking", children: "Par classement" }), (0, jsx_runtime_1.jsx)("option", { value: "name", children: "Par nom" }), (0, jsx_runtime_1.jsx)("option", { value: "age", children: "Par \u00E2ge" }), (0, jsx_runtime_1.jsx)("option", { value: "club", children: "Par club" })] })] }) }), filteredFencers.length === 0 ? ((0, jsx_runtime_1.jsxs)("div", { className: "empty-state", children: [(0, jsx_runtime_1.jsx)("div", { className: "empty-state-icon", children: "\uD83E\uDD3A" }), (0, jsx_runtime_1.jsx)("h2", { className: "empty-state-title", children: "Aucun tireur" })] })) : ((0, jsx_runtime_1.jsx)("div", { className: "card", children: (0, jsx_runtime_1.jsxs)("table", { className: "table", children: [(0, jsx_runtime_1.jsx)("thead", { children: (0, jsx_runtime_1.jsxs)("tr", { children: [(0, jsx_runtime_1.jsx)("th", { style: { width: '50px' }, children: "N\u00B0" }), (0, jsx_runtime_1.jsx)("th", { children: "Nom" }), (0, jsx_runtime_1.jsx)("th", { children: "Pr\u00E9nom" }), (0, jsx_runtime_1.jsx)("th", { children: "N\u00E9(e)" }), (0, jsx_runtime_1.jsx)("th", { children: "Club" }), (0, jsx_runtime_1.jsx)("th", { children: "Classement" }), (0, jsx_runtime_1.jsx)("th", { children: "Statut" }), (0, jsx_runtime_1.jsx)("th", { style: { width: '250px' }, children: "Actions" })] }) }), (0, jsx_runtime_1.jsx)("tbody", { children: filteredFencers.map((fencer) => ((0, jsx_runtime_1.jsxs)("tr", { children: [(0, jsx_runtime_1.jsx)("td", { className: "text-muted", children: fencer.ref }), (0, jsx_runtime_1.jsx)("td", { className: "font-medium", children: fencer.lastName }), (0, jsx_runtime_1.jsx)("td", { children: fencer.firstName }), (0, jsx_runtime_1.jsx)("td", { className: "text-sm text-muted", children: fencer.birthDate ? fencer.birthDate.getFullYear() : '-' }), (0, jsx_runtime_1.jsx)("td", { className: "text-sm text-muted", children: fencer.club || '-' }), (0, jsx_runtime_1.jsx)("td", { className: "text-sm", children: fencer.ranking ? `#${fencer.ranking}` : '-' }), (0, jsx_runtime_1.jsx)("td", { children: (0, jsx_runtime_1.jsx)("span", { className: `badge ${statusLabels[fencer.status].color}`, children: statusLabels[fencer.status].label }) }), (0, jsx_runtime_1.jsx)("td", { children: (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: '0.25rem', flexWrap: 'wrap', alignItems: 'center' }, children: [(0, jsx_runtime_1.jsx)("button", { className: "btn btn-sm btn-secondary", onClick: () => setEditingFencer(fencer), title: "Modifier", style: { fontSize: '0.75rem', padding: '0.25rem 0.5rem' }, children: "\u270F\uFE0F" }), (0, jsx_runtime_1.jsx)("button", { className: `btn btn-sm ${fencer.status === types_1.FencerStatus.CHECKED_IN ? 'btn-secondary' : 'btn-primary'}`, onClick: () => onCheckIn(fencer.id), style: { fontSize: '0.75rem', padding: '0.25rem 0.5rem' }, children: fencer.status === types_1.FencerStatus.CHECKED_IN ? 'Annuler' : 'Pointer' }), onSetFencerStatus && fencer.status === types_1.FencerStatus.CHECKED_IN && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("button", { className: "btn btn-sm btn-warning", onClick: () => handleSetFencerStatus(fencer.id, types_1.FencerStatus.ABANDONED, t('messages.confirm_abandon', { name: `${fencer.lastName} ${fencer.firstName}` })), title: "Abandonner", style: { fontSize: '0.75rem', padding: '0.25rem 0.5rem' }, children: "\uD83D\uDEB6" }), (0, jsx_runtime_1.jsx)("button", { className: "btn btn-sm btn-warning", onClick: () => handleSetFencerStatus(fencer.id, types_1.FencerStatus.FORFAIT, t('messages.confirm_forfait', { name: `${fencer.lastName} ${fencer.firstName}` })), title: "Forfait", style: { fontSize: '0.75rem', padding: '0.25rem 0.5rem' }, children: "\uD83D\uDCCB" })] })), onSetFencerStatus && (fencer.status === types_1.FencerStatus.ABANDONED || fencer.status === types_1.FencerStatus.FORFAIT) && ((0, jsx_runtime_1.jsx)("button", { className: "btn btn-sm btn-success", onClick: () => handleSetFencerStatus(fencer.id, types_1.FencerStatus.CHECKED_IN, t('messages.confirm_reactivate', { name: `${fencer.lastName} ${fencer.firstName}` })), title: "R\u00E9activer", style: { fontSize: '0.75rem', padding: '0.25rem 0.5rem' }, children: "\u2705" })), onDeleteFencer && ((0, jsx_runtime_1.jsx)("button", { className: "btn btn-sm btn-danger", onClick: () => handleDeleteFencer(fencer.id), title: "Supprimer", style: { fontSize: '0.75rem', padding: '0.25rem 0.5rem' }, children: "\uD83D\uDDD1\uFE0F" }))] }) })] }, fencer.id))) })] }) })), editingFencer && ((0, jsx_runtime_1.jsx)(EditFencerModal_1.default, { fencer: editingFencer, onSave: handleEditSave, onClose: () => setEditingFencer(null) }))] }));
};
exports.default = FencerList;
//# sourceMappingURL=FencerList.js.map