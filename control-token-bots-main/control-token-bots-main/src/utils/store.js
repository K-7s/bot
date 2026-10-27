const fs = require('fs');
const path = require('path');

class JsonStore {
  constructor(file = process.env.DATA_FILE || './data/database.json') {
    this.file = path.resolve(file);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (!fs.existsSync(this.file)) this.write(this.defaultData());
  }

  defaultData() {
    return {
      bots: [],
      settings: { logChannelId: null },
      reactions: [],
      audit: [],
    };
  }

  read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return this.defaultData();
    }
  }

  /** Atomic write: write to a temp file then rename, so a crash mid-write can't corrupt the DB. */
  write(data) {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  update(mutator) {
    const data = this.read();
    mutator(data);
    this.write(data);
    return data;
  }
}

module.exports = { JsonStore };
