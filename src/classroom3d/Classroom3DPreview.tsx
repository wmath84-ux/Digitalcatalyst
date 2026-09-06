// src/classroom3d/Classroom3DPreview.tsx
//
// Stand-alone sandbox for the 3D Classroom, at `#/dev/classroom-3d`.
// No auth, no Firestore, no course ownership: it feeds the room the demo
// course content so the whole seated experience (board, notes wall, mind map
// wall, desk console) can be reviewed on any device.
//
// Part 2 mounts the same <Classroom3D> inside CoursePlayerApp with the real
// course, the Firestore-backed notes and the persisted mind maps.

import { demoCourseContent } from "../data/demoCourseContent";
import Classroom3D from "./Classroom3D";

export default function Classroom3DPreview() {
  return (
    <Classroom3D
      modules={demoCourseContent}
      courseTitle="Demo course · 3D Classroom"
      onExit={() => {
        window.location.hash = "#/home";
      }}
    />
  );
}
