import * as XLSX from "xlsx";
import { query } from "./hasura";
import { find, words, split, findIndex, omit } from "lodash";
/* We are looping over cells in the file (not merged cells)
 * and we are getting:
 * 1) table with rows where '7:30' text is
 * 2) table with group names and their column ranges
 * 3) table with full names and abbreviations of teachers' names and surnames (taken from 'Legenda' under the schedule)
 * 4) table with buildings and rooms inside them ( taken from 'SALE' under the schedule)
 */
export function getInformationFromSingleCells(worksheet: XLSX.WorkSheet) {
  // cell with text 'Legenda'
  let legendColumn = null;
  let legendRow = null;
  // cell with text 'SALE'
  let roomColumn = null;
  let roomRow = null;
  // cell with text 'ROK 1 || ROK 2 || ROK 3'
  let yearRow = null;

  let groupNames: { start: string; end: string; name: string; degree?: string }[] = [];
  let sevenThirty: number[] = [];
  const teachers: { short: string; long: string }[] = [];
  const buildings: { name: string; rooms: string[] }[] = [];

  for (const cell in worksheet) {
    // cell - C121
    // cellRow - 121
    // cellColumn - C
    const cellRow = Number(cell.match(/\d/g)?.join("")) as number;
    const cellColumn = cell.match(/[a-z]{1,2}/i)?.join("") as string;
    const cellText = worksheet[cell].v;

    // take row number from cell with text 7:30
    if (cellText === "7.30") {
      // 7:30 text is in the same row but in many columns, but we are only interesetd in rows
      if (sevenThirty.indexOf(cellRow) === -1) {
        sevenThirty.push(cellRow);
      }
    } else if (yearRow && cellRow === yearRow + 1) {
      // group names are in the row under the cell with text ROK 1
      groupNames.push({ start: cellColumn, end: cellColumn, name: cellText });
    } else if (
      !yearRow &&
      cellText &&
      cellText.toString().match(/rok\s+([1-3]|[I]{1,3}|pierwszy|drugi|trzeci)/i)
    ) {
      // take row number from cell with text ROK 1 | ROK2 | ROK3 - we need it to locate group names
      yearRow = cellRow;
    } else if (cellText && cellText.toString().match(/sale/i)) {
      // locate cell with text 'SALE'
      roomRow = cellRow;
      roomColumn = cellColumn;
    } else if (
      roomColumn &&
      roomRow &&
      cellText !== " " &&
      cellRow > roomRow &&
      cellColumn === roomColumn
    ) {
      // take content under the cell with text 'SALE'
      addToBuildingsArray(cellText, buildings);
    } else if (cellText && cellText.toString().match(/skrót/i)) {
      // locate cell with text Legenda
      legendRow = cellRow;
      legendColumn = cellColumn;
    } else if (legendColumn && legendRow && cellRow > legendRow && cellColumn === legendColumn) {
      // take content under the cell with text 'Legenda'
      try {
        teachers.push({
          short: cellText,
          long: worksheet[`${String.fromCharCode(cellColumn.charCodeAt(0) + 1)}${cellRow}`].v,
        });
      } catch (e) {}
    }
  }

  return { buildings, groupNames, teachers, sevenThirty };
}

function addToBuilding(roomName: string, buildingName: string, buildings: any) {
  // check if building exists
  const building = find(buildings, (b) => b.name === buildingName);
  if (building) {
    // if building exists, check if that room is not already in it
    const room = find(building.rooms, (r) => r === roomName);
    if (room) {
      return;
    } else {
      building.rooms.push(roomName);
    }
  } else {
    // create building if it doesnt' exist
    buildings.push({ name: buildingName, rooms: [roomName] });
  }
}

function addToBuildingsArray(text: string, buildings: any) {
  // text - s. 1/15 Działownia - budynek "Działownia" ul. Warszawska
  const splitted = split(text, "-");
  // building part - budynek "Działownia" ul. Warszawska
  const building = splitted[1].trim();
  // room part - ["s.", "1/15", "Dzialownia"]
  const roomPart = words(splitted[0], /[^, ]+/g);

  // remove "s." part
  roomPart.splice(0, 1);

  // if there is more than one item in roomPart, we are checking if it is array of rooms e.g ['135','136']
  // or single room name e.g ['1/15','Dzialownia']
  if (roomPart.length > 1) {
    for (let i = 0; i < roomPart.length; i++) {
      if (roomPart[i + 1]) {
        // check if it is a room number after romm number
        if (roomPart[i].match(/[1-9]{1,3}/) && roomPart[i + 1].match(/[1-9]{1,3}/)) {
          addToBuilding(roomPart[i], building, buildings);
          addToBuilding(roomPart[i + 1], building, buildings);
        } else {
          addToBuilding(roomPart.join(" "), building, buildings);
        }
      }
    }
  } else {
    addToBuilding(roomPart[0], building, buildings);
  }
}
// calculate row ranges of days, we know that the first item in array sevenThirty is 7:30 from Monday
// and that there is 54 rows between 7:30 and 21:00
export function createDaysRanges(sevenThirty: any) {
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const days = sevenThirty.map((startCell: any, index: any) => ({
    day: dayNames[index],
    start: startCell,
    stop: startCell + 54,
  }));
  return days;
}

export function getInformationFromMergedCells(
  mergedCells: XLSX.Range[],
  worksheet: XLSX.WorkSheet,
  groupNames: any,
  sevenThirty: any
) {
  const days = createDaysRanges(sevenThirty);
  const studiesDegree = [];
  const data = [];
  if (mergedCells) {
    for (const range of mergedCells) {
      const startCell = XLSX.utils.encode_cell(range.s); //AN 178

      const startColumn = XLSX.utils.encode_col(range.s.c); //AN
      const endColumn = XLSX.utils.encode_col(range.e.c); //AQ

      const startRow = Number(XLSX.utils.encode_row(range.s.r)); //178
      const endRow = Number(XLSX.utils.encode_row(range.e.r)); // 178

      // the length of merged cell - how many rows it contains
      const length = endRow - startRow + 1;
      let rangeText = "";
      if (worksheet[startCell]?.v) {
        // remove whitespaces and new lines
        rangeText = words(worksheet[startCell].v, /[^, |\n ]+/g).join(" ");
      }
      // omit cells with day names
      if (rangeText.match(/poniedziałek|wtorek|środa|czwartek|piątek/i)) {
        continue;
      }

      if (rangeText.match(/studia\s+([1-2]|[I]{1,2}|pierwszego|drugiego)\s+stopnia/i)) {
        if (findIndex(studiesDegree, (studies) => studies.rangeText === rangeText) === -1) {
          studiesDegree.push({ start: startColumn, end: endColumn, rangeText });
        }
      }

      // update group names with merged groups and extra groups e.g erasmus
      const index = findIndex(groupNames, (group: any) => group.name === rangeText);
      if (index !== -1) {
        groupNames[index].start = startColumn;
        groupNames[index].end = endColumn;
      } else if (rangeText.match(/erasmus/i)) {
        groupNames.push({
          start: startColumn,
          end: endColumn,
          name: rangeText,
        });
      }
      // console.log(groupNames.length, "length");

      // calculate day, start time andend time based on rows
      const { day, startTime, endTime } = calculateTimeAndDay(days, startRow, length);
      if (day && startTime && endTime) {
        data.push({
          day,
          startTime,
          endTime,
          name: rangeText,
          startCol: startColumn,
          endCol: endColumn,
        });
      }
    }
  }
  return { data, studiesDegree };
}

function calculateTimeAndDay(days: any, startRow: any, length: any) {
  for (let i = 0; i < days.length; i++) {
    if (startRow < days[i].stop && startRow >= days[i].start) {
      const day = days[i].day;
      const distance = startRow - days[i].start;
      const duration = distance * 15;
      const durationX = length * 15;

      const [startHour, startMinute] = addMinutes(7, 30, duration);
      const [endHour, endMinute] = addMinutes(startHour, startMinute, durationX);
      return {
        day: day,
        startTime: `${startHour}:${startMinute == 0 ? "00" : startMinute}`,
        endTime: `${endHour}:${endMinute == 0 ? "00" : endMinute}`,
      };
    }
  }
  return { day: null, startTime: null, endTime: null };
}

function addMinutes(startHour: number, startMinutes: number, minutes: number) {
  const hours = Math.floor(minutes / 60);
  const minutesLeft = minutes % 60;

  let endHour = startHour + hours;
  let endMinutes = startMinutes + minutesLeft;
  if (endMinutes >= 60) {
    endHour += Math.floor(endMinutes / 60);
    endMinutes = endMinutes % 60;
  }

  return [endHour, endMinutes];
}

export async function prepareResult(data: any, groupNames: any, teachers: any) {
  const buildings = await getBuildings();

  const result: any = groupNames.map((groupName: any) => ({
    name: groupName.name,
    classes: [],
    degree: groupName.degree,
  }));

  for (const x of data) {
    const formattedData = {
      ...omit(x, ["name", "startCol", "endCol"]),
      ...getTeacher(x, teachers, buildings),
    };

    for (let j = 0; j < groupNames.length; j++) {
      try {
        if (
          biggerOrEqual(groupNames[j].start, x.startCol) &&
          biggerOrEqual(x.endCol, groupNames[j].end)
        ) {
          result[j].classes.push(formattedData);
        } else if (x.startCol === groupNames[j].start && x.endCol === groupNames[j].start) {
          const group = find(result, (group) => group.name === `1 polowa ${groupNames[j].name}`);
          if (group) {
            group.classes.push(formattedData);
          } else {
            result.push({
              name: `1 polowa ${groupNames[j].name}`,
              classes: [{ ...formattedData }],
              degree: groupNames[j].degree,
            });
          }
        } else if (x.startCol === groupNames[j].end && x.endCol === groupNames[j].end) {
          const group = find(result, (group) => group.name === `2 polowa ${groupNames[j].name}`);
          if (group) {
            group.classes.push(formattedData);
          } else {
            result.push({
              name: `2 polowa ${groupNames[j].name}`,
              classes: [formattedData],
              degree: groupNames[j].degree,
            });
          }
        } else if (x.startCol === groupNames[j].end) {
          const group = find(result, (group) => group.name === `2 polowa ${groupNames[j].name}`);
          if (group) {
            group.classes.push(formattedData);
          } else {
            result.push({
              name: `2 polowa ${groupNames[j].name}`,
              classes: [formattedData],
              degree: groupNames[j].degree,
            });
          }
        } else if (x.endCol === groupNames[j].start) {
          const group = find(result, (group) => group.name === `1 polowa ${groupNames[j].name}`);
          if (group) {
            group.classes.push(formattedData);
          } else {
            result.push({
              name: `1 polowa ${groupNames[j].name}`,
              classes: [formattedData],
              degree: group.name.degree,
            });
          }
        }
      } catch (e) {
        console.log(x.startCol, x.endCol, groupNames[j].start, groupNames[j].end, x.name);
      }
    }
  }
  return result;
}

function getTeacher(subjectName: any, teachers: any, buildings: any) {
  let regex = regexBuilder(subjectName.name);
  try {
    let {
      groups: { typ, nazwa, prowadzacy, sala, budynek },
    } = regex.exec(subjectName.name) as any;

    let matcher = null;
    if (sala) {
      for (const building of buildings) {
        for (const s of building.rooms) {
          if (sala.match(new RegExp(s.name))) {
            matcher = building.id;
          }
        }
      }
    }
    if (matcher) {
      budynek = matcher;
    }

    let dlugie = null;
    if (prowadzacy) {
      if (
        prowadzacy.match(/[A-ZŁ]{1,3}|[A-Z]{1,3}\/[A-Z]{1,3}/) &&
        !prowadzacy.match(/dr|mgr|prof/i)
      ) {
        for (const p of teachers) {
          if (p.short == prowadzacy) {
            dlugie = p.long;
          }
        }
      }
    }
    if (dlugie) {
      prowadzacy = dlugie;
    }

    if (matcher) {
      return {
        typ,
        nazwa,
        prowadzacy,
        sala,
        budynek,
        building_name: null,
      };
    }
    return {
      typ,
      nazwa,
      prowadzacy,
      sala,
      building_name: budynek,
      budynek: null,
    };
  } catch (err) {
    // TODO: jesli nie ma lab/wyklad itp a jest to cell zaczynajacy sie i konczacy w jednej literce to znaczy ze to laby
    console.log(subjectName.name, regex);
    return {
      typ: null,
      nazwa: subjectName.name,
      prowadzacy: null,
      sala: null,
      budynek: null,
    };
  }
}
// console.log(JSON.stringify(result, null, 2));

export function biggerOrEqual(a: string, b: string) {
  if (a.length > b.length) {
    return true;
  } else if (b.length > a.length) {
    return false;
  } else {
    return a >= b;
  }
}

function regexBuilder(name: string) {
  let regex = "(?<nazwa>.+) ";
  if (name.match(/\swykład\s|\sćw.?\s|\slab.?\s|\s[ćc]wiczenia\s/i)) {
    regex += "(?<typ>[wW]ykład|ćw.?|lab.?|[Ććc]wiczenia) ";
  }
  if (name.match(/\sdr|\smgr|\sprof/)) {
    regex += "(?<prowadzacy>dr.+|mgr.+|prof.+) ";
  } else if (name.match(/\s[A-ZŁ]{1,3}\s|[A-Z]{1,3}\/[A-Z]{1,3}/i) && !name.match(/lab. IF/)) {
    regex += "(?<prowadzacy>.+) ";
  }
  if (name.match(/\sIF|\sSPNJO/)) {
    regex += "(?<budynek>IF|SPNJO).?";
  }
  if (name.includes(" s")) {
    regex += "(?<sala>s.+)";
  }
  if (name.includes(" ul")) {
    regex += "(?<budynek>ul.+)";
  }
  return new RegExp(regex);
}

async function getBuildings() {
  const GET_BUILDINGS = `query{
  buildings {
    name
    rooms {
      name
    }
    id
  }
}
`;

  const response = await query({ query: GET_BUILDINGS, variables: {} });
  return response.data.buildings;
}
