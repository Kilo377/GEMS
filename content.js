// All asset paths remain relative for local HTTP previews and future GitHub Pages deployment.
window.GEMS = {
  title: 'Generative Embodied Multiple Behavior Control Systems for Human-like Agents',
  authors: [
    { name: 'Chongyu Bao', affiliations: '1', equal: true },
    { name: 'Haokai Yang', affiliations: '1', equal: true },
    { name: 'Yuhan Wang', affiliations: '1' },
    { name: 'Zhaochong An', affiliations: '2' },
    { name: 'Kunpeng Liu', affiliations: '3' },
    { name: 'Xiaolan Liu', affiliations: '1' }
  ],
  links: { arxiv: 'https://arxiv.org/abs/2609.22691', github: null, demo: 'https://anonymous.4open.science/r/review-video-82f4/demo.mp4' },
  // Living/dining/kitchen rectangle on the actor's side of the double doorway.
  // Interior wall faces, Unity world XYZ; the door partition is near X = -16.
  replayRoom: { min: [-15.9, 0.7, -23.8], max: [-9.2, 3.5, -16.2], margin: 0.18 },
  media: {
    teaser: { title: 'GEMS: a continuous kitchen sequence', src: './assets/videos/movie-001.mp4', poster: './assets/images/paper-v2-dinner.png' }
  },
  comparisonPlatforms: [
    {
      name: 'GEMS', ours: true, clips: [
        { file: 'gems-interaction', title: 'Object interaction' },
        { file: 'gems-sit-down', title: 'Sit down' }
      ]
    },
    {
      name: 'AGA', venue: 'TMLR 2024', clips: [
        { file: 'aga-interaction', title: 'Object interaction' },
        { file: 'aga-sit-down', title: 'Sit down' }
      ]
    },
    {
      name: 'X-VirtualHome', venue: 'AAAI 2026', clips: [
        { file: 'x-virtualhome-interaction', title: 'Object interaction' },
        { file: 'x-virtualhome-sit-down', title: 'Sit down' }
      ]
    },
    {
      name: 'ACTOR', venue: 'ICCV 2025', clips: [
        { file: 'humanise-microwave-20261016', title: 'Open microwave' },
        { file: 'humanise-sequence-01', title: 'Refrigerator interaction' }
      ]
    }
  ],
  comparisonBase: './assets/videos/comparison-20261015/'
};
