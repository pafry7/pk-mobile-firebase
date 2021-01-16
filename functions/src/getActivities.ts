import * as functions from "firebase-functions";
import { omit } from "lodash";
import { addMinutes, isAfter, isBefore, compareAsc } from "date-fns";
import { RRule } from "rrule";
import { query } from "./utils/hasura";
import { decodeAccessToken } from "./utils/jwt";

interface Activity {
  additional_info: string;
  duration: number;
  end_date: string;
  id: string;
  is_recurring: boolean;
  latitude: number;
  longitude: number;
  name: string;
  place: string;
  recurrence_pattern: string;
  start_date: string;
  type_fk: "CLASS" | "EVENT" | "PERSONAL";
}

const GET_ACTIVITIES = `query ($id: uuid) {
  activities(where: {id_student: {_eq: $id}}) {
    additional_info
    duration
    end_date
    id
    is_recurring
    latitude
    longitude
    name
    place
    recurrence_pattern
    start_date
    type_fk
  }
}`;

const createActivity = (activity: Activity, date: Date) => {
  const start_date = date;
  const end_date = addMinutes(start_date, activity.duration);
  return {
    duration: activity.duration,
    additional_info: activity.additional_info,
    type_fk: activity.type_fk,
    place: activity.place,
    name: activity.name,
    latitude: activity.latitude,
    longitude: activity.longitude,
    id: activity.id,
    start_date,
    end_date,
  };
};

export const getActivities = functions.https.onRequest(async (request, response) => {
  const { startDate, endDate } = request.body;
  const authHeader = request.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  functions.logger.info("Token: ", token);

  if (!token) {
    response.status(403).send({ error: "There is no token" });
  } else {
    const { err, id } = decodeAccessToken(token);
    if (err) {
      response.status(401).send("User is not authorized");
    }
    functions.logger.info({ id });

    try {
      const result = await query({
        query: GET_ACTIVITIES,
        variables: { id },
      });

      if (result.data.activities.length === 0) {
        response.status(404).send("User not found");
      }
      if (result.errors) {
        response.status(500).send(result.errors[0].message);
      }
      const data: Activity[] = result.data.activities;
      // console.log({ data });
      const activities = [];
      // console.log(startDate, endDate);

      for (const activity of data) {
        if (activity.is_recurring) {
          try {
            const rule = RRule.fromString(activity.recurrence_pattern);
            const dates = rule.between(new Date(startDate), new Date(endDate));
            // console.log({ dates });
            for (const date of dates) {
              activities.push(createActivity(activity, date));
            }
          } catch (e) {
            console.log(activity, "error");
          }
        } else {
          if (
            isAfter(new Date(activity.start_date), startDate) &&
            isBefore(endDate, new Date(activity.end_date))
          ) {
            activities.push(omit(activity, "is_recurring", "recurrence_pattern", "duration"));
          }
        }
      }

      const compare = (activityA: any, activityB: any) => {
        return compareAsc(activityA.start_date, activityB.start_date);
      };

      // console.log({ activities }, "here");
      response.status(200).send({ activities: activities.sort(compare) });
    } catch (error) {
      console.log(error);
      response.status(500).send({ error: error });
    }
  }
});
