/**
 * VLC Cloud Launcher - Google Apps Script
 *
 * Deploy this as a Web App to serve as the backend API.
 *
 * Setup:
 * 1. Create a new Google Sheet
 * 2. Set the header row: ID | Name | Category | URL | Favorite | CreatedAt
 * 3. Open Extensions > Apps Script
 * 4. Paste this code
 * 5. Update SHEET_ID with your Google Sheet ID
 * 6. Deploy > New Deployment > Web App
 * 7. Set "Execute as" to "Me" and "Who has access" to "Anyone"
 * 8. Copy the Web App URL and paste in config.js
 */

const SHEET_ID = '1dOqFeDobbIB_FyrhEVGBskcpVs3-EOY92xWH0N0pHGg';
const SHEET_NAME = 'Sheet1';

function doGet(e) {
  const endpoint = e.parameter.endpoint;

  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);

    if (!sheet) {
      return createResponse({ error: 'Sheet not found. Check SHEET_ID.' }, 404);
    }

    switch (endpoint) {
      case 'list':
        return handleList(sheet);
      default:
        return createResponse({ error: 'Unknown endpoint: ' + endpoint }, 400);
    }
  } catch (err) {
    return createResponse({ error: err.toString() }, 500);
  }
}

function doPost(e) {
  const endpoint = e.parameter.endpoint;
  let data = null;

  try {
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e.parameter.data) {
      data = JSON.parse(e.parameter.data);
    }
  } catch (parseErr) {
    return createResponse({ error: 'Invalid JSON data' }, 400);
  }

  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);

    if (!sheet) {
      return createResponse({ error: 'Sheet not found. Check SHEET_ID.' }, 404);
    }

    switch (endpoint) {
      case 'add':
        return handleAdd(sheet, data);
      case 'update':
        return handleUpdate(sheet, data);
      case 'delete':
        return handleDelete(sheet, data);
      default:
        return createResponse({ error: 'Unknown endpoint: ' + endpoint }, 400);
    }
  } catch (err) {
    return createResponse({ error: err.toString() }, 500);
  }
}

function handleList(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    return createResponse([]);
  }

  const headers = data[0];
  const streams = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0] && !row[3]) continue;

    const stream = {
      ID: String(row[0] || ''),
      Name: String(row[1] || ''),
      Category: String(row[2] || 'Other'),
      URL: String(row[3] || ''),
      Favorite: String(row[4]).toUpperCase() === 'TRUE',
      CreatedAt: String(row[5] || ''),
    };
    streams.push(stream);
  }

  streams.sort((a, b) => {
    const dateA = new Date(a.CreatedAt || 0);
    const dateB = new Date(b.CreatedAt || 0);
    return dateB - dateA;
  });

  return createResponse(streams);
}

function handleAdd(sheet, data) {
  if (!data) {
    return createResponse({ error: 'No data provided' }, 400);
  }

  if (!data.URL) {
    return createResponse({ error: 'URL is required' }, 400);
  }

  const id = data.ID || generateId();
  const name = data.Name || 'Unnamed Stream';
  const category = data.Category || 'Other';
  const url = data.URL;
  const favorite = data.Favorite === true ? 'TRUE' : 'FALSE';
  const createdAt = data.CreatedAt || new Date().toISOString();

  sheet.appendRow([id, name, category, url, favorite, createdAt]);

  return createResponse({ success: true, id: id });
}

function handleUpdate(sheet, data) {
  if (!data) {
    return createResponse({ error: 'No data provided' }, 400);
  }

  const id = data.ID;

  if (!id) {
    return createResponse({ error: 'ID is required' }, 400);
  }

  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === id) {
      const row = i + 1;
      const name = data.Name || values[i][1] || '';
      const category = data.Category || values[i][2] || 'Other';
      const url = data.URL || values[i][3] || '';
      const favorite = data.Favorite !== undefined ? (data.Favorite ? 'TRUE' : 'FALSE') : values[i][4];
      const createdAt = data.CreatedAt || values[i][5] || new Date().toISOString();

      sheet.getRange(row, 1, 1, 6).setValues([[id, name, category, url, favorite, createdAt]]);
      return createResponse({ success: true, id: id });
    }
  }

  return createResponse({ error: 'Stream not found: ' + id }, 404);
}

function handleDelete(sheet, data) {
  if (!data) {
    return createResponse({ error: 'No data provided' }, 400);
  }

  const id = data.id || data.ID;

  if (!id) {
    return createResponse({ error: 'ID is required' }, 400);
  }

  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === id) {
      sheet.deleteRow(i + 1);
      return createResponse({ success: true, id: id });
    }
  }

  return createResponse({ error: 'Stream not found: ' + id }, 404);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function createResponse(data, statusCode) {
  const response = ContentService.createTextOutput(JSON.stringify(data));
  response.setMimeType(ContentService.MimeType.JSON);
  return response;
}
