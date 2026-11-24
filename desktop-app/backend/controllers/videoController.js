'use strict';

function createVideoController({ videoInfoService }) {
  return {
    async analyze(req, res) {
      const info = await videoInfoService.analyze(req.validUrl);
      res.json(info);
    },
  };
}

module.exports = { createVideoController };
