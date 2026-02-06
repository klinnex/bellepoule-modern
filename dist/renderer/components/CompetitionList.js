"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
const useTranslation_1 = require("../hooks/useTranslation");
const CompetitionList = ({ competitions, isLoading, onSelect, onDelete, onNewCompetition }) => {
    const { t } = (0, useTranslation_1.useTranslation)();
    if (isLoading) {
        return ((0, jsx_runtime_1.jsx)("div", { className: "content", children: (0, jsx_runtime_1.jsx)("div", { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }, children: (0, jsx_runtime_1.jsx)("div", { className: "text-muted", children: t('messages.loading') }) }) }));
    }
    if (competitions.length === 0) {
        return ((0, jsx_runtime_1.jsxs)("div", { className: "content", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex justify-between items-center mb-4", children: [(0, jsx_runtime_1.jsx)("h1", { className: "page-title", children: t('app.title') }), (0, jsx_runtime_1.jsxs)("button", { className: "btn btn-primary btn-lg", onClick: onNewCompetition, children: ["+ ", t('menu.new_competition')] })] }), (0, jsx_runtime_1.jsx)("div", { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }, children: (0, jsx_runtime_1.jsxs)("div", { className: "empty-state", children: [(0, jsx_runtime_1.jsx)("div", { className: "empty-state-icon", children: "\uD83E\uDD3A" }), (0, jsx_runtime_1.jsx)("h2", { className: "empty-state-title", children: t('messages.no_competitions') }), (0, jsx_runtime_1.jsxs)("p", { className: "empty-state-description", children: [t('messages.no_competitions'), ". ", t('menu.new_competition').toLowerCase(), " ", t('actions.add').toLowerCase()] }), (0, jsx_runtime_1.jsxs)("button", { className: "btn btn-primary btn-lg", onClick: onNewCompetition, children: ["+ ", t('menu.new_competition')] })] }) })] }));
    }
    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "content", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex justify-between items-center mb-4", children: [(0, jsx_runtime_1.jsx)("h1", { className: "page-title", children: t('app.title') }), (0, jsx_runtime_1.jsxs)("button", { className: "btn btn-primary btn-lg", onClick: onNewCompetition, children: ["+ ", t('menu.new_competition')] })] }), (0, jsx_runtime_1.jsx)("div", { className: "competition-grid", children: competitions.map((competition) => ((0, jsx_runtime_1.jsx)("div", { className: "card competition-card", onClick: () => onSelect(competition), style: {
                        background: competition.color || '#3B82F6',
                        borderLeft: `4px solid ${competition.color || '#3B82F6'}`
                    }, children: (0, jsx_runtime_1.jsxs)("div", { className: "card-body", children: [(0, jsx_runtime_1.jsxs)("div", { className: "card-header", children: [(0, jsx_runtime_1.jsx)("h3", { className: "card-title", children: competition.title }), (0, jsx_runtime_1.jsx)("div", { className: "card-actions", children: (0, jsx_runtime_1.jsx)("button", { className: "btn btn-icon btn-secondary", onClick: (e) => {
                                                e.stopPropagation();
                                                onDelete(competition.id);
                                            }, title: t('actions.delete'), children: "\uD83D\uDDD1\uFE0F" }) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "card-content", children: [(0, jsx_runtime_1.jsxs)("div", { className: "card-meta", children: [(0, jsx_runtime_1.jsxs)("div", { className: "meta-item", children: [(0, jsx_runtime_1.jsxs)("span", { className: "meta-label", children: [t('competition.date'), ":"] }), (0, jsx_runtime_1.jsx)("span", { children: formatDate(competition.date) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "meta-item", children: [(0, jsx_runtime_1.jsxs)("span", { className: "meta-label", children: [t('competition.location'), ":"] }), (0, jsx_runtime_1.jsx)("span", { children: competition.location || t('actions.default') })] }), (0, jsx_runtime_1.jsxs)("div", { className: "meta-item", children: [(0, jsx_runtime_1.jsxs)("span", { className: "meta-label", children: [t('competition.weapon'), ":"] }), (0, jsx_runtime_1.jsx)("span", { children: competition.weapon })] })] }), (0, jsx_runtime_1.jsx)("div", { className: "card-footer", children: (0, jsx_runtime_1.jsxs)("span", { className: "card-status", children: [t('actions.view'), " \u2192"] }) })] })] }) }, competition.id))) })] }));
};
exports.default = CompetitionList;
//# sourceMappingURL=CompetitionList.js.map