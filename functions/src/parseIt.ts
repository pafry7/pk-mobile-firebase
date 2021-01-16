import { Client } from "@googlemaps/google-maps-services-js";
import * as functions from "firebase-functions";
import { difference } from "lodash";
import * as XLSX from "xlsx";
import {
  getInformationFromSingleCells,
  biggerOrEqual,
  prepareResult,
  getInformationFromMergedCells,
} from "./utils/helpers";

// const API_KEY = "AIzaSyD2MxtX9rQWnI4FT9RBD8vCpO236gIZ2Us";
const API_KEY = "AIzaSyCUGzdafkNZZfJVigxNaeuRxrSgTT00d9E";
import { query } from "./utils/hasura";

const runtimeOpts = {
  timeoutSeconds: 180,
};

const GET_BUILDING = `
   query ($name: String){
      buildings(where: {name: {_eq: $name}}) {
        id
        rooms {
          name
        }
      }
    }`;
const INSERT_BUILDING_WITH_ROOMS = `
  mutation ($objects: [buildings_insert_input!]!) {
  insert_buildings(objects: $objects) {
    returning {
      id
      name
      rooms {
        id
        name
      }
    }
  }
}
  `;
interface Data {
  day: string;
  startTime: string;
  endTime: string;
  name: string;
  startCol: string;
  endCol: string;
}
const ADD_ROOMS = `mutation ($objects: [rooms_insert_input!]!) {
  insert_rooms(objects: $objects) {
    returning {
      building_id
      name
    }
  }
}
`;

const getCoordinates = async (
  buildingName: string,
  client: any
): Promise<{ lat: number; lng: number } | null> => {
  try {
    // const response = await client.geocode({
    //   params: {
    //     address: `${buildingName} Kraków Politechnika Krakowska`,
    //     key: API_KEY,
    //   },
    // });

    // return response.data.results[0].geometry.location;
    return { lat: 50, lng: 19 };
  } catch (e) {
    console.log(e);
    return null;
  }
};

const prepereVariable = (building: any, coordinates: any) => {
  const rooms = building.rooms.map((room: string) => ({ name: room }));
  return {
    objects: [
      {
        name: building.name,
        latitude: coordinates.lat,
        longitude: coordinates.lng,
        rooms: { data: rooms },
      },
    ],
  };
};

// {"objects": [{"name": "Test groupa", "id_course": "878f4e71-fa82-452d-8371-cd09a88866ce", "degree_fk": "first",
// "classes": { "data": [{ "day": "Poniedziałek", "end_time": "12:00", "start_time": "10:00", "name": "Testowe zajecia", "teacher": "Patryk Fryda", "type": "lab", "building_id": "cef2b17e-7617-4e18-9078-e4489f115164" }] }}]}
interface Class {
  day: string;
  endTime: string;
  startTime: string;
  nazwa: string;
  prowadzacy: string;
  typ: string;
  sala: string;
  budynek: string | null;
  building_name: string | null;
}

interface Group {
  name: string;
  degree: string;
  classes: Class[];
}
const prepereGroups = (group: Group, courseId: string) => {
  const classes = group.classes.map((c) => ({
    name: c.nazwa,
    day: c.day,
    end_time: c.endTime,
    start_time: c.startTime,
    room: c.sala,
    teacher: c.prowadzacy,
    type: c.typ,
    building_id: c.budynek,
    building_name: c.building_name,
  }));
  const degree_fk = group.degree === "studia I stopnia" ? "first" : "second";
  return {
    objects: [
      {
        name: group.name,
        id_course: courseId,
        degree_fk,
        classes: { data: classes },
      },
    ],
  };
};

const handleBuildings = async (buildings: any) => {
  const client = new Client({});

  // const result = await query({
  //   query: GET_BUILDING,
  //   variables: { name: building.name },
  // });
  const promises = buildings.map((building: any) => {
    return query({
      query: GET_BUILDING,
      variables: { name: building.name },
    })
      .then((result) => {
        if (result.data.buildings.length === 0) {
          return getCoordinates(building.name, client).then((coordinates) => {
            const variables = prepereVariable(building, coordinates);
            return query({ query: INSERT_BUILDING_WITH_ROOMS, variables }).then((res) => {
              console.log(res);
              console.log("inserted");
            });
          });
        } else {
          console.log("already exists checking rooms");
          const adjustedRooms = result.data.buildings[0].rooms.map((room: any) => room.name);
          const diffArray = difference(building.rooms, adjustedRooms);
          if (diffArray.length === 0) {
            console.log("No differences");
          } else {
            console.log(diffArray, "differences");
            console.log("id", result.data.buildings[0].id);
            const v = {
              objects: diffArray.map((room: any) => ({
                building_id: result.data.buildings[0].id,
                name: room,
              })),
            };
            console.log(v, "variable");
            return query({ query: ADD_ROOMS, variables: v }).then((res) => console.log(res));
          }
        }
      })
      .catch((e) => console.log(e));
  });

  await Promise.all(promises);
};

export const parseIt = functions
  .runWith({ timeoutSeconds: 300 })
  .https.onRequest(async (request, response) => {
    const workbook = XLSX.readFile(
      "/home/projects/pk-mobile-firebase/functions/lib/src/schedules/test.xls"
    );
    const first_sheet_name = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[first_sheet_name];

    let { buildings, sevenThirty, teachers, groupNames } = getInformationFromSingleCells(worksheet);
    // console.log(groupNames.length, "length");

    if (buildings) {
      // await handleBuildings(buildings);
    }

    const mergedCells = worksheet["!merges"] as XLSX.Range[];

    let { data, studiesDegree } = getInformationFromMergedCells(
      mergedCells,
      worksheet,
      groupNames,
      sevenThirty
    );

    groupNames = groupNames.map((group: any) => {
      for (const degree of studiesDegree) {
        if (biggerOrEqual(degree.end, group.end)) {
          return { ...group, degree: degree.rangeText };
        }
      }
    });

    // groups and classes
    const results = await prepareResult(data, groupNames, teachers);
    // console.log(JSON.stringify(results, null, 2));

    const courseId = await getCourseId("Informatyka");

    const firstPart = results.slice(0, Math.floor(results.length / 2) + 1);
    const secondPart = results.slice(Math.floor(results.length / 2) + 1);
    // specjalnie przeciagnac w czasie promisy dla hasury zeby nie przekroczyc
    // podzielic na 2 i po minucie poscic reszte :)))))))))))
    console.log("before handleGroups first");
    await handleGroups(firstPart, courseId);
    console.log("after handleGroups first");
    await delay(1500);
    // handleGroups(secondPart, courseId);
    console.log("before handleGroups second");
    await handleGroups(secondPart, courseId);
    console.log("after handleGroups second");

    response.status(200).send({ message: "everything ok" });
  });
async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getCourseId(name: string) {
  const GET_COURSE_ID = `query ($name: String!) {
  courses(where: {name: { _eq: $name}}) {
    id
  }
}
`;

  const response = await query({ query: GET_COURSE_ID, variables: { name } });
  return response.data.courses[0].id;
}

async function getGroup(name: string) {
  const GET_GROUP = `query ($name: String!) {
  groups(where: {name: { _eq: $name}}) {
    id
  }
}
`;

  const response = await query({ query: GET_GROUP, variables: { name } });
  // console.log({ response });
  return response;
}

async function handleGroups(array: any, courseId: string) {
  const INSERT_GROUP = `mutation ($objects: [groups_insert_input!]!) {
  insert_groups(objects: $objects) {
    returning {
      id
      name
    }
  }
}`;
  for (const group of array) {
    try {
      const res = await getGroup(group.name);
      // there is no group like that
      // TODO: handle rrors, try catches, remove everything and check, compare with existing plan
      if (res.data.groups.length === 0) {
        // post group with classes
        const groupVariable = prepereGroups(group, courseId);
        const res2 = await query({ query: INSERT_GROUP, variables: groupVariable });
        console.log("res2", res2);
      } else {
        console.log(`${group.name} exists`);
      }
    } catch (e) {
      console.error(e);
    }
  }
}
