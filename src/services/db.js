import PouchDB from 'pouchdb-browser'

class DatabaseService {
  constructor() {
    this.contactsDB = null
    this.messagesDB = null
    this.settingsDB = null
    this._initialized = false
  }

  async init() {
    if (this._initialized) return
    
    this.contactsDB = new PouchDB('universal-pim-contacts')
    this.messagesDB = new PouchDB('universal-pim-messages')
    this.settingsDB = new PouchDB('universal-pim-settings')
    
    this._initialized = true
  }

  // Contacts
  async getAllContacts() {
    const result = await this.contactsDB.allDocs({ include_docs: true })
    return result.rows.map(row => row.doc)
  }

  async getContact(id) {
    try {
      return await this.contactsDB.get(id)
    } catch (e) {
      return null
    }
  }

  async saveContact(contact) {
    contact._id = contact._id || `contact_${Date.now()}`
    contact.updatedAt = new Date().toISOString()
    
    try {
      const existing = await this.contactsDB.get(contact._id)
      contact._rev = existing._rev
    } catch (e) {
      // New document
    }
    
    const result = await this.contactsDB.put(contact)
    return { ...contact, _rev: result.rev }
  }

  async deleteContact(id) {
    const doc = await this.contactsDB.get(id)
    await this.contactsDB.remove(doc)
  }

  // Messages
  async getAllMessages() {
    const result = await this.messagesDB.allDocs({ include_docs: true })
    return result.rows.map(row => row.doc)
  }

  async getMessagesByContact(contactId) {
    const all = await this.getAllMessages()
    return all.filter(m => m.contactId === contactId)
  }

  async getMessagesByChannel(channel) {
    const all = await this.getAllMessages()
    return all.filter(m => m.channel === channel)
  }

  async saveMessage(message) {
    message._id = message._id || `message_${Date.now()}`
    message.updatedAt = new Date().toISOString()
    
    try {
      const existing = await this.messagesDB.get(message._id)
      message._rev = existing._rev
    } catch (e) {
      // New document
    }
    
    const result = await this.messagesDB.put(message)
    return { ...message, _rev: result.rev }
  }

  async deleteMessage(id) {
    const doc = await this.messagesDB.get(id)
    await this.messagesDB.remove(doc)
  }

  // Settings
  async getSetting(key, defaultValue = null) {
    try {
      const doc = await this.settingsDB.get(`setting_${key}`)
      return doc.value
    } catch (e) {
      return defaultValue
    }
  }

  async setSetting(key, value) {
    const id = `setting_${key}`
    let doc = { _id: id }
    
    try {
      const existing = await this.settingsDB.get(id)
      doc._rev = existing._rev
    } catch (e) {
      // New document
    }
    
    doc.key = key
    doc.value = value
    await this.settingsDB.put(doc)
    return true
  }

  async getAllSettings() {
    const result = await this.settingsDB.allDocs({ include_docs: true })
    const settings = {}
    result.rows.forEach(row => {
      if (row.doc.key) {
        settings[row.doc.key] = row.doc.value
      }
    })
    return settings
  }

  // Export/Import for sync
  async exportData() {
    const contacts = await this.getAllContacts()
    const messages = await this.getAllMessages()
    const settings = await this.getAllSettings()
    
    return {
      contacts,
      messages,
      settings,
      exportedAt: new Date().toISOString()
    }
  }

  async importData(data) {
    if (data.contacts) {
      for (const contact of data.contacts) {
        await this.saveContact(contact)
      }
    }
    
    if (data.messages) {
      for (const message of data.messages) {
        await this.saveMessage(message)
      }
    }
    
    if (data.settings) {
      for (const [key, value] of Object.entries(data.settings)) {
        await this.setSetting(key, value)
      }
    }
  }

  // Change listeners
  onContactsChange(callback) {
    this.contactsDB.changes({
      since: 'now',
      live: true
    }).on('change', callback)
  }

  onMessagesChange(callback) {
    this.messagesDB.changes({
      since: 'now',
      live: true
    }).on('change', callback)
  }
}

export const db = new DatabaseService()
export default db
