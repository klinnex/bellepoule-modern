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
exports.TouchOptimizedReferee = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * BellePoule Modern - Touch-Optimized Tablet Interface for Referees
 * Enhanced remote scoring interface with touch optimization
 * Licensed under GPL-3.0
 */
const react_1 = __importStar(require("react"));
const types_1 = require("../../shared/types");
const TouchOptimizedReferee = ({ match, fencerA, fencerB, maxScore, onScoreUpdate, onMatchEnd, onVoiceCommand }) => {
    const [scoreA, setScoreA] = (0, react_1.useState)(match.scoreA?.value || 0);
    const [scoreB, setScoreB] = (0, react_1.useState)(match.scoreB?.value || 0);
    const [matchTime, setMatchTime] = (0, react_1.useState)(0);
    const [isRunning, setIsRunning] = (0, react_1.useState)(match.status === types_1.MatchStatus.IN_PROGRESS);
    const [swipeDirection, setSwipeDirection] = (0, react_1.useState)(null);
    const [voiceEnabled, setVoiceEnabled] = (0, react_1.useState)(false);
    const [isListening, setIsListening] = (0, react_1.useState)(false);
    const intervalRef = (0, react_1.useRef)(null);
    const touchStartRef = (0, react_1.useRef)(null);
    // Timer management
    (0, react_1.useEffect)(() => {
        if (isRunning) {
            intervalRef.current = setInterval(() => {
                setMatchTime(prev => prev + 1);
            }, 1000);
        }
        else {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        }
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [isRunning]);
    // Touch gesture handlers
    const handleTouchStart = (0, react_1.useCallback)((e) => {
        touchStartRef.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY
        };
    }, []);
    const handleTouchEnd = (0, react_1.useCallback)((e) => {
        if (!touchStartRef.current)
            return;
        const touchEnd = {
            x: e.changedTouches[0].clientX,
            y: e.changedTouches[0].clientY
        };
        const deltaX = touchEnd.x - touchStartRef.current.x;
        const deltaY = Math.abs(touchEnd.y - touchStartRef.current.y);
        // Horizontal swipe detected (more horizontal than vertical)
        if (Math.abs(deltaX) > 50 && deltaY < 100) {
            if (deltaX > 0) {
                setSwipeDirection('right');
                handleScoreIncrement('B');
            }
            else {
                setSwipeDirection('left');
                handleScoreIncrement('A');
            }
            setTimeout(() => setSwipeDirection(null), 300);
        }
        touchStartRef.current = null;
    }, []);
    // Voice recognition
    (0, react_1.useEffect)(() => {
        if (!voiceEnabled || !onVoiceCommand)
            return;
        const recognition = new window.webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'fr-FR';
        recognition.onresult = (event) => {
            const last = event.results.length - 1;
            const command = event.results[last][0].transcript.toLowerCase();
            onVoiceCommand(command);
            processVoiceCommand(command);
        };
        recognition.onerror = () => {
            setIsListening(false);
        };
        recognition.onend = () => {
            setIsListening(false);
        };
        if (isListening) {
            recognition.start();
        }
        return () => {
            recognition.stop();
        };
    }, [voiceEnabled, isListening, onVoiceCommand]);
    const processVoiceCommand = (command) => {
        // Simple voice commands
        if (command.includes('point') || command.includes('touche')) {
            if (command.includes('rouge') || command.includes('a')) {
                handleScoreIncrement('A');
            }
            else if (command.includes('vert') || command.includes('b')) {
                handleScoreIncrement('B');
            }
        }
        else if (command.includes('annuler')) {
            handleScoreDecrement('A');
            handleScoreDecrement('B');
        }
        else if (command.includes('terminer') || command.includes('fin')) {
            handleMatchEnd();
        }
        else if (command.includes('pause') || command.includes('arrêter')) {
            setIsRunning(false);
        }
        else if (command.includes('reprendre') || command.includes('continuer')) {
            setIsRunning(true);
        }
    };
    const handleScoreIncrement = (fencer) => {
        if (fencer === 'A') {
            const newScore = Math.min(scoreA + 1, maxScore);
            setScoreA(newScore);
            onScoreUpdate(newScore, scoreB);
            if (newScore >= maxScore) {
                handleMatchEnd();
            }
        }
        else {
            const newScore = Math.min(scoreB + 1, maxScore);
            setScoreB(newScore);
            onScoreUpdate(scoreA, newScore);
            if (newScore >= maxScore) {
                handleMatchEnd();
            }
        }
    };
    const handleScoreDecrement = (fencer) => {
        if (fencer === 'A') {
            const newScore = Math.max(scoreA - 1, 0);
            setScoreA(newScore);
            onScoreUpdate(newScore, scoreB);
        }
        else {
            const newScore = Math.max(scoreB - 1, 0);
            setScoreB(newScore);
            onScoreUpdate(scoreA, newScore);
        }
    };
    const handleMatchEnd = () => {
        setIsRunning(false);
        onMatchEnd();
    };
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };
    const getSwipeAnimation = () => {
        if (!swipeDirection)
            return '';
        return swipeDirection === 'left' ? 'animate-swipe-left' : 'animate-swipe-right';
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "touch-referee-interface h-screen bg-gray-100 flex flex-col", onTouchStart: handleTouchStart, onTouchEnd: handleTouchEnd, children: [(0, jsx_runtime_1.jsx)("div", { className: "bg-white shadow-md p-4", children: (0, jsx_runtime_1.jsxs)("div", { className: "flex justify-between items-center", children: [(0, jsx_runtime_1.jsxs)("div", { className: "text-2xl font-bold text-gray-800", children: ["Piste ", match.number || 1] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center space-x-4", children: [(0, jsx_runtime_1.jsx)("div", { className: "text-xl font-mono", children: formatTime(matchTime) }), (0, jsx_runtime_1.jsx)("button", { onClick: () => setIsRunning(!isRunning), className: `px-4 py-2 rounded-lg font-medium ${isRunning
                                        ? 'bg-red-500 text-white'
                                        : 'bg-green-500 text-white'}`, children: isRunning ? 'PAUSE' : 'START' })] })] }) }), (0, jsx_runtime_1.jsx)("div", { className: "flex-1 flex items-center justify-center p-4", children: (0, jsx_runtime_1.jsxs)("div", { className: "w-full max-w-4xl", children: [(0, jsx_runtime_1.jsxs)("div", { className: "grid grid-cols-2 gap-8 mb-8", children: [(0, jsx_runtime_1.jsxs)("div", { className: `text-center ${getSwipeAnimation()}`, children: [(0, jsx_runtime_1.jsxs)("div", { className: "bg-red-500 text-white rounded-lg p-6 mb-4", children: [(0, jsx_runtime_1.jsxs)("div", { className: "text-lg font-medium", children: [fencerA.firstName, " ", fencerA.lastName] }), (0, jsx_runtime_1.jsxs)("div", { className: "text-sm opacity-75", children: ["N\u00B0", fencerA.ref] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "bg-white rounded-lg shadow-lg p-8", children: [(0, jsx_runtime_1.jsx)("div", { className: "text-6xl font-bold text-gray-800 mb-4", children: scoreA }), (0, jsx_runtime_1.jsxs)("div", { className: "flex justify-center space-x-2", children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => handleScoreIncrement('A'), className: "w-16 h-16 bg-red-500 text-white rounded-full text-2xl font-bold active:scale-95 transition-transform", children: "+1" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => handleScoreDecrement('A'), className: "w-16 h-16 bg-gray-300 text-gray-700 rounded-full text-2xl font-bold active:scale-95 transition-transform", children: "-1" })] })] }), (0, jsx_runtime_1.jsx)("div", { className: "mt-4 text-sm text-gray-600 text-center", children: "Glisser vers la gauche ou toucher +1 pour ajouter un point" })] }), (0, jsx_runtime_1.jsx)("div", { className: "flex items-center justify-center", children: (0, jsx_runtime_1.jsx)("div", { className: "text-3xl font-bold text-gray-400", children: "VS" }) }), (0, jsx_runtime_1.jsxs)("div", { className: `text-center ${getSwipeAnimation()}`, children: [(0, jsx_runtime_1.jsxs)("div", { className: "bg-green-500 text-white rounded-lg p-6 mb-4", children: [(0, jsx_runtime_1.jsxs)("div", { className: "text-lg font-medium", children: [fencerB.firstName, " ", fencerB.lastName] }), (0, jsx_runtime_1.jsxs)("div", { className: "text-sm opacity-75", children: ["N\u00B0", fencerB.ref] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "bg-white rounded-lg shadow-lg p-8", children: [(0, jsx_runtime_1.jsx)("div", { className: "text-6xl font-bold text-gray-800 mb-4", children: scoreB }), (0, jsx_runtime_1.jsxs)("div", { className: "flex justify-center space-x-2", children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => handleScoreIncrement('B'), className: "w-16 h-16 bg-green-500 text-white rounded-full text-2xl font-bold active:scale-95 transition-transform", children: "+1" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => handleScoreDecrement('B'), className: "w-16 h-16 bg-gray-300 text-gray-700 rounded-full text-2xl font-bold active:scale-95 transition-transform", children: "-1" })] })] }), (0, jsx_runtime_1.jsx)("div", { className: "mt-4 text-sm text-gray-600 text-center", children: "Glisser vers la droite ou toucher +1 pour ajouter un point" })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "bg-white rounded-lg p-4 mb-8", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex justify-between text-sm text-gray-600 mb-2", children: [(0, jsx_runtime_1.jsxs)("span", { children: [scoreA, " / ", maxScore] }), (0, jsx_runtime_1.jsxs)("span", { children: ["Premier \u00E0 ", maxScore, " points"] }), (0, jsx_runtime_1.jsxs)("span", { children: [scoreB, " / ", maxScore] })] }), (0, jsx_runtime_1.jsx)("div", { className: "h-4 bg-gray-200 rounded-full overflow-hidden", children: (0, jsx_runtime_1.jsxs)("div", { className: "h-full flex", style: { width: '100%' }, children: [(0, jsx_runtime_1.jsx)("div", { className: "bg-red-500 transition-all duration-300", style: { width: `${(scoreA / maxScore) * 100}%` } }), (0, jsx_runtime_1.jsx)("div", { className: "bg-green-500 transition-all duration-300", style: { width: `${(scoreB / maxScore) * 100}%` } })] }) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "grid grid-cols-2 gap-4", children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => {
                                        setScoreA(0);
                                        setScoreB(0);
                                        onScoreUpdate(0, 0);
                                    }, className: "bg-yellow-500 text-white px-6 py-4 rounded-lg font-medium text-lg active:scale-95 transition-transform", children: "R\u00E9initialiser Score" }), (0, jsx_runtime_1.jsx)("button", { onClick: handleMatchEnd, className: "bg-blue-500 text-white px-6 py-4 rounded-lg font-medium text-lg active:scale-95 transition-transform", children: "Terminer Match" })] })] }) }), (0, jsx_runtime_1.jsx)("div", { className: "bg-white shadow-md p-4", children: (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center space-x-2", children: [(0, jsx_runtime_1.jsxs)("button", { onClick: () => {
                                        setVoiceEnabled(!voiceEnabled);
                                        if (!voiceEnabled) {
                                            setIsListening(true);
                                        }
                                    }, className: `px-4 py-2 rounded-lg font-medium ${voiceEnabled
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-gray-300 text-gray-700'}`, children: ["\uD83C\uDFA4 ", voiceEnabled ? 'Actif' : 'Inactif'] }), isListening && ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center space-x-2", children: [(0, jsx_runtime_1.jsx)("div", { className: "w-2 h-2 bg-red-500 rounded-full animate-pulse" }), (0, jsx_runtime_1.jsx)("span", { className: "text-sm text-gray-600", children: "\u00C9coute..." })] }))] }), (0, jsx_runtime_1.jsx)("div", { className: "text-sm text-gray-600", children: "Commandes: \"Point rouge/vert\", \"Pause\", \"Reprendre\", \"Terminer\"" })] }) }), (0, jsx_runtime_1.jsx)("style", { dangerouslySetInnerHTML: { __html: `
        @keyframes swipe-left {
          0% { transform: translateX(0); }
          50% { transform: translateX(-20px); }
          100% { transform: translateX(0); }
        }
        
        @keyframes swipe-right {
          0% { transform: translateX(0); }
          50% { transform: translateX(20px); }
          100% { transform: translateX(0); }
        }
        
        .animate-swipe-left {
          animation: swipe-left 0.3s ease-out;
        }
        
        .animate-swipe-right {
          animation: swipe-right 0.3s ease-out;
        }
      ` } })] }));
};
exports.TouchOptimizedReferee = TouchOptimizedReferee;
//# sourceMappingURL=TouchOptimizedReferee.js.map