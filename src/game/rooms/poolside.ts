import type { RoomDefinition } from '../types';

export const poolsideRoom: RoomDefinition = {
  roomId: 'poolside',
  name: 'Sunny Poolside Resort',
  backgroundImage: '/maps/poolside.webp',
  thumbnail: '/maps/thumbs/poolside.webp',
  icon: '🏊',
  schedule: 'weekends',
  width: 1024,
  height: 576,
  bounds: { minX: 25, maxX: 1024 - 25, minY: 218, maxY: 576 - 25 },
  outfit: 'swim',
  spawnPoint: { x: 512, y: 470 },
  
  // Water pool area: between background deck coping and foreground deck edge
  waterZones: [
    { x: 30, y: 246, width: 964, height: 186 }
  ],

  // Walkable land areas: Foreground deck and upper background deck
  walkableZones: [
    // Foreground deck (spacious main terrace)
    { x: 10, y: 432, width: 1004, height: 138 },
    // Background deck (accessible via ladders or around sides)
    { x: 165, y: 220, width: 680, height: 26 }
  ],

  // Ladders connect background deck and water
  ladderTriggers: [
    // Left ladder (near wall building)
    { x: 70, y: 220, width: 55, height: 45, targetState: 'water', targetY: 270 },
    // Right ladder (near umbrellas)
    { x: 890, y: 220, width: 55, height: 45, targetState: 'water', targetY: 270 }
  ],

  // Obstacles that block land movement
  obstacles: [
    // Foreground planters
    { x: 0, y: 495, width: 105, height: 81 },     // Bottom-left flower planter
    { x: 915, y: 495, width: 109, height: 81 },   // Bottom-right flower planter
    
    // Background deck furniture & structure
    { x: 0, y: 150, width: 165, height: 95 },     // Lifeguard house & bench
    { x: 720, y: 180, width: 304, height: 65 },   // Sun loungers & umbrellas
  ],

  exits: [
    { triggerBox: [0, 500, 30, 76], targetRoom: 'beach_coming_soon' },
    { triggerBox: [994, 500, 30, 76], targetRoom: 'lounge_coming_soon' }
  ]
};
