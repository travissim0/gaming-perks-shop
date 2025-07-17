import React from "react";

interface SeasonWinnersModalProps {
  open: boolean;
  onClose: () => void;
  season: number | null;
  winners: string[];
}

const SeasonWinnersModal: React.FC<SeasonWinnersModalProps> = ({ open, onClose, season, winners }) => {
  if (!open || !season) return null;
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900/95 backdrop-blur-md rounded-lg p-6 max-w-md w-full border-2 border-cyan-400 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold text-cyan-400 mb-4 text-center">Season {season} Winners</h2>
        <ul className="text-green-400 space-y-1 mb-6 text-center">
          {winners.length > 0 ? winners.map((winner, i) => (
            <li key={i}>{winner}</li>
          )) : <li className="text-gray-400">No winners recorded for this season.</li>}
        </ul>
        <button onClick={onClose} className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded w-full">Close</button>
      </div>
    </div>
  );
};

export default SeasonWinnersModal; 