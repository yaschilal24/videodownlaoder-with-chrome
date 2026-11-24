'use strict';
const express = require('express');
const { wrap } = require('../middleware/validation');
const { AppError } = require('../utils/errors');
const { validateSettingsPatch } = require('../utils/validators');

function settingsRoutes({ repo, queue, files, ffmpegService, onSettingsChanged }) {
  const r = express.Router();

  r.get('/settings', wrap(async (_req, res) => {
    const settings = repo.getSettings();
    const [ytdlp, ffmpeg] = await Promise.all([ffmpegService.getYtDlpStatus(), ffmpegService.getFfmpegStatus()]);
    res.json({ ...settings, tools: { ytdlp, ffmpeg } });
  }));

  r.put('/settings', wrap(async (req, res) => {
    const v = validateSettingsPatch(req.body);
    if (!v.ok) throw new AppError('VALIDATION', v.error, 400);
    if (v.value.downloadDirectory) v.value.downloadDirectory = await files.ensureDir(v.value.downloadDirectory);
    const settings = repo.updateSettings(v.value);
    queue.pump();
    onSettingsChanged && onSettingsChanged(settings);
    res.json(settings);
  }));

  r.post('/settings/reset', wrap(async (_req, res) => {
    const settings = repo.resetSettings();
    onSettingsChanged && onSettingsChanged(settings);
    res.json(settings);
  }));

  return r;
}

module.exports = { settingsRoutes };
