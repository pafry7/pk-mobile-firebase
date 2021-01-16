import * as functions from "firebase-functions";
import { find, flattenDeep } from "lodash";
import { addMinutes, addDays, startOfWeek, closestTo, differenceInMinutes } from "date-fns";
import { RRule } from "rrule";
import { query } from "./utils/hasura";
import { generateAccessToken } from "./utils/jwt";

const ADD_STUDENT = `
mutation ($data: students_insert_input!) {
  insert_students_one(object: $data) {
    id
    students_groups {
      group {
        classes {
          type
          teacher
          start_time
          room
          name
          day
          end_time
          building {
            longitude
            latitude
            name
          }
        }
      }
    }
  }
}
`;

const ADD_ACTIVITIES = `mutation ($activities: [activities_insert_input!]!){
  insert_activities(objects: $activities) {
    affected_rows
  }
}`;
interface Data {
  id: string;
  students_groups: { group: { classes: Class[] } }[];
}
interface Class {
  type: string | null;
  teacher: string | null;
  start_time: string;
  room: string | null;
  name: string;
  day: string;
  end_time: string;
  building: {
    longitude: number;
    latitude: number;
    name: string;
  } | null;
}

export const register = functions.https.onRequest(async (request, response) => {
  const { email, fullName, password, laboratoryGroup, exerciseGroup } = request.body;
  console.log(email, fullName, password);

  const variables = {
    data: {
      email: email,
      password: password,
      role: "user",
      name: fullName,
      students_groups: {
        data: [{ id_group: laboratoryGroup }, { id_group: exerciseGroup }],
      },
    },
  };

  try {
    const result = await query({
      query: ADD_STUDENT,
      variables,
    });

    if (result.errors) {
      response.status(500).send(result.errors[0].message);
    }
    const data: Data = result.data.insert_students_one;
    const token = generateAccessToken({ id: data.id });

    //create activities based on classes
    const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    const rule = new RRule({
      freq: RRule.WEEKLY,
      dtstart: new Date(Date.UTC(2021, 0, 15, 10, 30, 0)),
      until: new Date(Date.UTC(2021, 2, 1, 12, 0, 0)),
      interval: 1,
    });

    const startOfWeekDate = startOfWeek(now, { weekStartsOn: 1 });
    // take dates for current week
    const weekDates = dayNames.map((name, index) => ({
      name: name,
      date: addDays(startOfWeekDate, index),
    }));
    const activities = data.students_groups.map((item) => {
      return item.group.classes.map((cl) => {
        const date = find(weekDates, (weekDate) => weekDate.name === cl.day);
        let start_date = null;
        // end of recurring event
        let end_date = null;
        let duration = 0;
        let recurrence_pattern = null;
        if (date) {
          let tmp = cl.start_time.split(":");
          const startMinutesToAdd = Number(tmp[0]) * 60 + Number(tmp[1]);
          start_date = addMinutes(date.date, startMinutesToAdd);
          tmp = cl.end_time.split(":");
          const endMinutesToAdd = Number(tmp[0]) * 60 + Number(tmp[1]);
          duration = endMinutesToAdd - startMinutesToAdd;
          // semestr zimowy
          if (month > 8) {
            // 1 luty
            end_date = addMinutes(new Date(year + 1, 1, 1), endMinutesToAdd);
          } else if (month === 0) {
            end_date = addMinutes(new Date(year, 1, 1), endMinutesToAdd);
          }
          // semestr letni
          else if (month >= 1 && month <= 6) {
            // 1 lipiec
            end_date = addMinutes(new Date(year, 6, 1), endMinutesToAdd);
          } else {
            console.log("There are no classes for this month");
          }
          const rule = new RRule({
            freq: RRule.WEEKLY,
            dtstart: start_date,
            until: end_date,
            interval: 1,
          });
          recurrence_pattern = rule.toString();
        }
        return {
          start_date,
          end_date,
          type_fk: "CLASS",
          place: cl.building?.name,
          longitude: cl.building?.longitude,
          latitude: cl.building?.longitude,
          name: cl.name,
          id_student: data.id,
          additional_info: `Type:${cl.type} Teacher:${cl.teacher} Room:${cl.room}`,
          duration,
          is_recurring: true,
          recurrence_pattern,
        };
      });
    });
    const activitiesResponse = await query({
      query: ADD_ACTIVITIES,
      variables: { activities: flattenDeep(activities) },
    });
    console.log(activitiesResponse);

    response.status(200).send({ user: { id: data.id, token } });
  } catch (error) {
    response.status(500).send(error);
  }
});
