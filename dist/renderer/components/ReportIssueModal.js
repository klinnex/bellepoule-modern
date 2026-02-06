"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * BellePoule Modern - Report Issue Modal
 * Creates a GitHub issue with pre-filled information
 * Licensed under GPL-3.0
 */
const react_1 = require("react");
const Toast_1 = require("./Toast");
const ReportIssueModal = ({ onClose }) => {
    const { showToast } = (0, Toast_1.useToast)();
    const [issueType, setIssueType] = (0, react_1.useState)('bug');
    const [title, setTitle] = (0, react_1.useState)('');
    const [description, setDescription] = (0, react_1.useState)('');
    const [versionInfo, setVersionInfo] = (0, react_1.useState)(null);
    const [systemInfo, setSystemInfo] = (0, react_1.useState)('');
    (0, react_1.useEffect)(() => {
        // Récupérer les infos de version
        if (window.electronAPI?.getVersionInfo) {
            window.electronAPI.getVersionInfo().then((info) => {
                setVersionInfo(info);
            }).catch(() => {
                setVersionInfo({ version: '1.0.0', build: 0, date: 'Inconnue' });
            });
        }
        // Récupérer les infos système
        const platform = navigator.platform || 'Unknown';
        const userAgent = navigator.userAgent || '';
        let os = 'Unknown';
        if (userAgent.includes('Windows')) {
            os = 'Windows';
            if (userAgent.includes('Windows NT 10'))
                os = 'Windows 10/11';
        }
        else if (userAgent.includes('Mac')) {
            os = 'macOS';
        }
        else if (userAgent.includes('Linux')) {
            os = 'Linux';
        }
        setSystemInfo(os);
    }, []);
    const handleSubmit = () => {
        if (!title.trim()) {
            showToast('Veuillez entrer un titre', 'warning');
            return;
        }
        const timestamp = new Date().toISOString();
        const versionString = versionInfo
            ? `${versionInfo.version}-build.${versionInfo.build}`
            : 'Inconnue';
        // Construire le corps de l'issue
        const issueBody = `## Description

${description || '_Aucune description fournie_'}

## Informations système

| Info | Valeur |
|------|--------|
| **Version** | \`${versionString}\` |
| **Build Date** | ${versionInfo?.date || 'Inconnue'} |
| **OS** | ${systemInfo} |
| **Timestamp** | ${timestamp} |

## ${issueType === 'bug' ? 'Étapes pour reproduire' : 'Détails supplémentaires'}

${issueType === 'bug' ? '_Décrivez les étapes pour reproduire le bug..._' : '_Ajoutez des détails si nécessaire..._'}

---
_Issue créée automatiquement depuis BellePoule Modern_`;
        // Construire l'URL GitHub
        const labels = issueType === 'bug' ? 'bug' : 'enhancement';
        const issueTitle = issueType === 'bug' ? `🐛 ${title}` : `✨ ${title}`;
        const params = new URLSearchParams({
            title: issueTitle,
            body: issueBody,
            labels: labels,
        });
        const githubUrl = `https://github.com/klinnex/bellepoule-modern/issues/new?${params.toString()}`;
        // Ouvrir dans le navigateur
        if (window.electronAPI?.openExternal) {
            window.electronAPI.openExternal(githubUrl);
        }
        else {
            window.open(githubUrl, '_blank');
        }
        onClose();
    };
    return ((0, jsx_runtime_1.jsx)("div", { className: "modal-overlay", onClick: onClose, children: (0, jsx_runtime_1.jsxs)("div", { className: "modal", onClick: e => e.stopPropagation(), style: { maxWidth: '500px' }, children: [(0, jsx_runtime_1.jsxs)("div", { className: "modal-header", children: [(0, jsx_runtime_1.jsx)("h2", { children: "\uD83D\uDCDD Signaler un bug / Suggestion" }), (0, jsx_runtime_1.jsx)("button", { className: "btn-close", onClick: onClose, children: "\u00D7" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "modal-body", children: [(0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { children: "Type" }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: '0.5rem' }, children: [(0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => setIssueType('bug'), style: {
                                                flex: 1,
                                                padding: '0.75rem',
                                                border: `2px solid ${issueType === 'bug' ? '#ef4444' : '#e5e7eb'}`,
                                                borderRadius: '8px',
                                                background: issueType === 'bug' ? '#fef2f2' : 'white',
                                                cursor: 'pointer',
                                                fontSize: '1rem',
                                                fontWeight: issueType === 'bug' ? '600' : '400',
                                                color: issueType === 'bug' ? '#dc2626' : '#374151',
                                            }, children: "\uD83D\uDC1B Bug" }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => setIssueType('feature'), style: {
                                                flex: 1,
                                                padding: '0.75rem',
                                                border: `2px solid ${issueType === 'feature' ? '#22c55e' : '#e5e7eb'}`,
                                                borderRadius: '8px',
                                                background: issueType === 'feature' ? '#f0fdf4' : 'white',
                                                cursor: 'pointer',
                                                fontSize: '1rem',
                                                fontWeight: issueType === 'feature' ? '600' : '400',
                                                color: issueType === 'feature' ? '#16a34a' : '#374151',
                                            }, children: "\u2728 Suggestion" })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { htmlFor: "issue-title", children: issueType === 'bug' ? 'Résumé du problème' : 'Titre de la suggestion' }), (0, jsx_runtime_1.jsx)("input", { type: "text", id: "issue-title", className: "form-input", value: title, onChange: e => setTitle(e.target.value), placeholder: issueType === 'bug'
                                        ? "Ex: Le score ne s'enregistre pas correctement"
                                        : "Ex: Ajouter l'export PDF des résultats", autoFocus: true })] }), (0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { htmlFor: "issue-description", children: issueType === 'bug' ? 'Que s\'est-il passé ?' : 'Décrivez votre idée' }), (0, jsx_runtime_1.jsx)("textarea", { id: "issue-description", className: "form-input", value: description, onChange: e => setDescription(e.target.value), placeholder: issueType === 'bug'
                                        ? "Décrivez ce qui s'est passé et ce que vous attendiez..."
                                        : "Expliquez votre suggestion en détail...", rows: 4, style: { resize: 'vertical' } })] }), (0, jsx_runtime_1.jsxs)("div", { style: {
                                padding: '0.75rem',
                                background: '#f3f4f6',
                                borderRadius: '8px',
                                fontSize: '0.875rem',
                                color: '#6b7280'
                            }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }, children: "\u2139\uFE0F Informations automatiquement incluses :" }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem' }, children: [(0, jsx_runtime_1.jsx)("span", { children: "\u2022 Version :" }), (0, jsx_runtime_1.jsx)("span", { style: { fontFamily: 'monospace' }, children: versionInfo ? `${versionInfo.version}-build.${versionInfo.build}` : 'Chargement...' }), (0, jsx_runtime_1.jsx)("span", { children: "\u2022 Syst\u00E8me :" }), (0, jsx_runtime_1.jsx)("span", { children: systemInfo || 'Chargement...' }), (0, jsx_runtime_1.jsx)("span", { children: "\u2022 Date :" }), (0, jsx_runtime_1.jsx)("span", { children: new Date().toLocaleString('fr-FR') })] })] }), (0, jsx_runtime_1.jsxs)("p", { style: {
                                fontSize: '0.75rem',
                                color: '#9ca3af',
                                marginTop: '0.75rem',
                                textAlign: 'center'
                            }, children: ["Cliquer sur \"Cr\u00E9er sur GitHub\" ouvrira votre navigateur.", (0, jsx_runtime_1.jsx)("br", {}), "Vous devrez vous connecter \u00E0 GitHub pour soumettre l'issue."] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "modal-footer", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: "btn btn-secondary", onClick: onClose, children: "Annuler" }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: "btn btn-primary", onClick: handleSubmit, style: {
                                background: issueType === 'bug' ? '#dc2626' : '#16a34a',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }, children: "Cr\u00E9er sur GitHub \uD83D\uDD17" })] })] }) }));
};
exports.default = ReportIssueModal;
//# sourceMappingURL=ReportIssueModal.js.map