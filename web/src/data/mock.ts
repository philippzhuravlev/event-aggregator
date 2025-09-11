import type { Page, Event, Place } from '../types';

// Mock Facebook Pages
export const pages: Page[] = [
    {
        id: 'shuset.dk',
        name: 'S-Huset',
        url: 'https://www.facebook.com/shuset.dk',
        active: true,
    },
    {
        id: 'DiagonalenDTU',
        name: 'Diagonalen',
        url: 'https://www.facebook.com/DiagonalenDTU',
        active: true,
    },
];

const shusetPlace: Place = {
    id: '111222333',
    name: 'S-Huset, DTU Lyngby',
    location: {
        city: 'Kongens Lyngby',
        country: 'DK',
        latitude: 55.785,
        longitude: 12.522,
    },
};

const diagonalenPlace: Place = {
    id: '444555666',
    name: 'Diagonalen, DTU Lyngby',
    location: {
        city: 'Kongens Lyngby',
        country: 'DK',
        latitude: 55.7855,
        longitude: 12.519,
    },
};

// Mock Facebook Events
export const events: Event[] = [
    {
        id: '1234567890',
        pageId: 'shuset.dk',
        title: 'Friday Bar',
        description: 'Classic Friday vibes with music and cheap beers.',
        startTime: '2025-09-19T16:00:00+02:00',
        endTime: '2025-09-19T22:00:00+02:00',
        place: shusetPlace,
        coverImageUrl: 'https://picsum.photos/seed/shuset/800/400',
        eventURL: 'https://facebook.com/events/1234567890',
        createdAt: '2025-09-10T12:00:00.000Z',
        updatedAt: '2025-09-10T12:00:00.000Z',
    },
    {
        id: '0987654321',
        pageId: 'DiagonalenDTU',
        title: 'Quiz Night',
        description: 'Bring a team of 4–5 and win drink vouchers.',
        startTime: '2025-09-24T19:00:00+02:00',
        endTime: '2025-09-24T22:00:00+02:00',
        place: diagonalenPlace,
        coverImageUrl: 'https://picsum.photos/seed/diagonalen/800/400',
        eventURL: 'https://facebook.com/events/0987654321',
        createdAt: '2025-09-10T12:00:00.000Z',
        updatedAt: '2025-09-10T12:00:00.000Z',
    },
    {
        id: '1122334455',
        pageId: 'shuset.dk',
        title: 'Semester Kickoff Party',
        description: 'Live DJ, welcome drinks, and meet new students.',
        startTime: '2025-09-13T21:00:00+02:00',
        endTime: '2025-09-14T02:00:00+02:00',
        place: shusetPlace,
        coverImageUrl: 'https://picsum.photos/seed/kickoff/800/400',
        eventURL: 'https://facebook.com/events/1122334455',
        createdAt: '2025-09-10T12:00:00.000Z',
        updatedAt: '2025-09-10T12:00:00.000Z',
    },
];


