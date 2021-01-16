import * as functions from "firebase-functions";
import { query } from "./utils/hasura";
import { decodeAccessToken } from "./utils/jwt";

interface Event {
  start_date: string;
  name: string;
  longitude?: number;
  id: string;
  place: string;
  latitude?: number;
  end_date: string;
  description: string;
  building?: {
    id: string;
    latitude: number;
    longitude: number;
    name: string;
  };
}

const ADD_EVENT = `
mutation ($object: students_events_insert_input!) {
  insert_students_events_one(object: $object){
      id
  }
}
`;
const ADD_ACTIVITY = `
mutation ($object: activities_insert_input!) {
  insert_activities_one(object: $object){
    id
  }
}
`;

export const addEvent = functions.https.onRequest(async (request, response) => {
  const event: Event = request.body;
  console.log("request body", request.body);
  const authHeader = request.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  console.log({ token });
  if (!token) {
    response.status(403).send("There is no token");
  } else {
    const { err, id } = decodeAccessToken(token);
    console.log("student id", id);

    if (err) {
      response.status(401).send("User is not authorized");
    }

    const activity = {
      start_date: event.start_date,
      name: event.name,
      latitude: event.latitude ? event.latitude : event.building?.latitude,
      place: event.place ? event.place : event.building?.name,
      longitude: event.longitude ? event.longitude : event.building?.longitude,
      end_date: event.end_date,
      additional_info: event.description,
      id_student: id,
      type_fk: "EVENT",
      activities_repeats_fkey: null,
    };
    console.log(activity);

    // 1. Add event to user in db, add it to activity
    try {
      const addEventPromise = query({
        query: ADD_EVENT,
        variables: { object: { id_event: event.id, id_student: id } },
      });
      const addActivityPromise = query({
        query: ADD_ACTIVITY,
        variables: { object: activity },
      });

      const result = await Promise.all([addEventPromise, addActivityPromise]);

      console.log(JSON.stringify(result, null, 2));

      // if (result[0].errors)
      // response.status(500).send(result[0].errors[0].message)
      // }
      // if (result[1].errors)
      //   response.status(500).send(result[1].errors)
      // }
      response.status(200).send({ message: "Added successfully!" });
    } catch (error) {
      response.status(500).send(error);
    }
  }
});
